import "@/lib/server-only";

import { createHash } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { GoogleAuth } from "google-auth-library";
import {
  buildSpeechSegments,
  formatVoiceOptionLabel,
  isReaderLanguage,
  isSupportedSpeechRate,
  type ReaderLanguage,
  type VoiceOption,
} from "@/lib/voiceReader";
import {
  processSegmentForTTS,
  normalizeText,
  type PronunciationEntryData,
} from "@/services/pronunciationService";
import { prisma } from "@/lib/prisma";
import { normalizeMpegAudioBuffer } from "@/lib/audio";

type GoogleTtsConfig = {
  bucketName: string;
  curatedVoices: Record<ReaderLanguage, VoiceOption[]>;
};

type SynthesizeSegmentInput = {
  projectId: string;
  chapterId: string;
  chapterUpdatedAt: Date;
  chapterTitle: string;
  chapterContent: string;
  language: ReaderLanguage;
  voiceId: string;
  rate: number;
  segmentIndex: number;
};

let cachedConfig: GoogleTtsConfig | null = null;
let cachedStorage: Storage | null = null;
let cachedAuth: GoogleAuth | null = null;
let cachedToken: string | null = null;
let tokenExpiry: number = 0;
function getGoogleClientOptions() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  return projectId ? { projectId } : undefined;
}

function getStorageClient() {
  cachedStorage ??= new Storage(getGoogleClientOptions());
  return cachedStorage;
}

export function getTextToSpeechClient() {
  return {};
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function parseCuratedVoices(value: string, language: ReaderLanguage) {
  const voices = value
    .split(",")
    .flatMap((entry) => {
      const trimmed = entry.trim();
      return trimmed ? [{ id: trimmed, label: formatVoiceOptionLabel(trimmed), language }] : [];
    });

  if (voices.length === 0) {
    throw new Error(`No curated Google TTS voices configured for ${language}.`);
  }

  return voices;
}

function getConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = {
    bucketName: requireEnv("GOOGLE_TTS_CACHE_BUCKET"),
    curatedVoices: {
      "en-US": parseCuratedVoices(requireEnv("GOOGLE_TTS_CURATED_VOICES_EN"), "en-US"),
      "vi-VN": parseCuratedVoices(requireEnv("GOOGLE_TTS_CURATED_VOICES_VI"), "vi-VN"),
    },
  };

  return cachedConfig;
}

function sanitizeKeyPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function looksLikeWavAudioBuffer(buffer: Uint8Array) {
  return (
    buffer.byteLength >= 12 &&
    buffer[0] === 0x52 && // 'R'
    buffer[1] === 0x49 && // 'I'
    buffer[2] === 0x46 && // 'F'
    buffer[3] === 0x46 && // 'F'
    buffer[8] === 0x57 && // 'W'
    buffer[9] === 0x41 && // 'A'
    buffer[10] === 0x56 && // 'V'
    buffer[11] === 0x45    // 'E'
  );
}

function pcmToWav(pcmBuffer: Buffer, sampleRate: number = 24000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const chunkSize = 36 + dataSize;

  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(chunkSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM format = 1
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

function ssmlToPlaintext(ssml: string): string {
  let text = ssml;
  text = text.replace(/<sub\s+alias="([^"]+)"[^>]*>.*?<\/sub>/gi, "$1");
  text = text.replace(/<phoneme\s+[^>]*ph="([^"]+)"[^>]*>(.*?)<\/phoneme>/gi, "$2");
  text = text.replace(/<say-as\s+interpret-as="spell-out"[^>]*>(.*?)<\/say-as>/gi, (_, term) => term.split("").join(" "));
  text = text.replace(/<say-as\s+[^>]*>(.*?)<\/say-as>/gi, "$1");
  text = text.replace(/<speak>/gi, "").replace(/<\/speak>/gi, "");
  text = text.replace(/<break[^>]*\/>/gi, " ");
  text = text.replace(/<[^>]+>/g, "");
  return text.replace(/\s+/g, " ").trim();
}

function toAudioBuffer(audioContent: Uint8Array | string | null | undefined) {
  if (!audioContent) {
    throw new Error("Google TTS returned empty audio.");
  }

  if (typeof audioContent === "string") {
    const decodedBuffer = Buffer.from(audioContent, "base64");
    if (looksLikeWavAudioBuffer(decodedBuffer)) {
      return decodedBuffer;
    }
    const normalizedBuffer = normalizeMpegAudioBuffer(decodedBuffer);
    if (normalizedBuffer) {
      return normalizedBuffer;
    }
    throw new Error("Google TTS returned invalid audio.");
  }

  if (looksLikeWavAudioBuffer(audioContent)) {
    return Buffer.from(audioContent);
  }
  const normalizedBuffer = normalizeMpegAudioBuffer(audioContent);
  if (normalizedBuffer) {
    return normalizedBuffer;
  }

  throw new Error("Google TTS returned invalid audio.");
}

function assertMpegAudioBuffer(audioBuffer: Uint8Array, source: "cache" | "synthesis") {
  if (looksLikeWavAudioBuffer(audioBuffer)) {
    return;
  }
  if (!normalizeMpegAudioBuffer(audioBuffer)) {
    throw new Error(
      source === "cache"
        ? "Cached voice segment is not valid audio."
        : "Google TTS returned invalid audio.",
    );
  }
}

function buildCacheObjectPath(input: {
  projectId: string;
  chapterId: string;
  chapterUpdatedAt: Date;
  language: ReaderLanguage;
  voiceId: string;
  rate: number;
  segmentText: string;
  normalizerVersion?: string;
  pronunciationProfileHash?: string;
}) {
  const hash = createHash("sha256")
    .update(input.chapterId)
    .update(input.chapterUpdatedAt.toISOString())
    .update(input.language)
    .update(input.voiceId)
    .update(String(input.rate))
    .update(input.segmentText)
    .update(input.normalizerVersion ?? "")
    .update(input.pronunciationProfileHash ?? "")
    .digest("hex");

  return [
    "voice-reader",
    sanitizeKeyPart(input.projectId),
    sanitizeKeyPart(input.chapterId),
    sanitizeKeyPart(input.language),
    sanitizeKeyPart(input.voiceId),
    sanitizeKeyPart(String(input.rate)),
    `${hash}.mp3`,
  ].join("/");
}

function getCachedBucket() {
  const config = getConfig();
  return getStorageClient().bucket(config.bucketName);
}

export function listCuratedVoices(language: ReaderLanguage) {
  return getConfig().curatedVoices[language];
}

export function isConfiguredVoice(language: ReaderLanguage, voiceId: string) {
  return listCuratedVoices(language).some((voice) => voice.id === voiceId);
}

async function loadPronunciationEntries(
  projectId: string,
  language: string,
): Promise<PronunciationEntryData[]> {
  const entries = await prisma.pronunciationEntry.findMany({
    where: { projectId, language, enabled: true },
    orderBy: [{ priority: "desc" }, { term: "asc" }],
    select: {
      term: true,
      replacement: true,
      renderMode: true,
      matchMode: true,
      caseSensitive: true,
      priority: true,
      enabled: true,
    },
  });
  // Prisma widens enum fields to string; cast is safe given schema constraints
  return entries as PronunciationEntryData[];
}

async function callGeminiTts(
  text: string,
  language: ReaderLanguage,
  voiceId: string,
  rate: number,
): Promise<Buffer> {
  const location = process.env.GOOGLE_TTS_LOCATION?.trim() || "us-central1";
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) {
    throw new Error("GOOGLE_CLOUD_PROJECT is not configured.");
  }

  const now = Date.now();
  let token: string | null = null;

  if (cachedToken && tokenExpiry > now + 5 * 60 * 1000) {
    token = cachedToken;
  } else {
    cachedAuth ??= new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const authClient = await cachedAuth.getClient();
    const tokenResponse = await authClient.getAccessToken();
    token = tokenResponse.token;
    if (!token) {
      throw new Error("Failed to retrieve Google API access token.");
    }
    cachedToken = token;
    const expiry = (authClient as any).credentials?.expiry_date;
    tokenExpiry = typeof expiry === "number" ? expiry : now + 3600 * 1000;
  }

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/gemini-3.1-flash-tts-preview:generateContent`;

  let steeredText = text;
  if (rate < 0.9) {
    steeredText = `Speak slowly: ${text}`;
  } else if (rate > 1.1) {
    steeredText = `Speak quickly: ${text}`;
  }

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: steeredText,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voiceId,
          },
        },
      },
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Gemini TTS API request failed: ${response.statusText}. Response: ${errorBody}`);
  }

  const data = await response.json();
  const base64Data = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Data) {
    console.error("Gemini TTS response structure error:", JSON.stringify(data));
    throw new Error("Failed to get audio data from Gemini TTS model response.");
  }

  const pcmBuffer = Buffer.from(base64Data, "base64");
  return pcmToWav(pcmBuffer, 24000);
}

export async function synthesizeWithSsml(
  client: any,
  ssml: string,
  language: ReaderLanguage,
  voiceId: string,
  rate: number,
) {
  const plainText = ssmlToPlaintext(ssml);
  return callGeminiTts(plainText, language, voiceId, rate);
}

export async function synthesizeWithText(
  client: any,
  text: string,
  language: ReaderLanguage,
  voiceId: string,
  rate: number,
) {
  const plainText = ssmlToPlaintext(text);
  return callGeminiTts(plainText, language, voiceId, rate);
}

async function uploadToCache(file: ReturnType<ReturnType<Storage["bucket"]>["file"]>, audioBuffer: Buffer) {
  await file.save(audioBuffer, {
    resumable: false,
    contentType: "audio/mpeg",
    metadata: {
      cacheControl: "private, max-age=31536000, immutable",
    },
  });
}

export async function synthesizeChapterSegment(input: SynthesizeSegmentInput) {
  if (!isReaderLanguage(input.language)) {
    throw new Error("Unsupported reader language.");
  }

  if (!isSupportedSpeechRate(input.rate)) {
    throw new Error("Unsupported reader speed.");
  }

  if (!isConfiguredVoice(input.language, input.voiceId)) {
    throw new Error("Unsupported Google TTS voice.");
  }

  const speechSegments = buildSpeechSegments(input.chapterTitle, input.chapterContent);
  const segmentText = speechSegments[input.segmentIndex];

  if (!segmentText) {
    throw new Error("Segment not found.");
  }

  const client = getTextToSpeechClient();

  const entries = await loadPronunciationEntries(input.projectId, input.language);
  const { ssml, pronunciationProfileHash } = processSegmentForTTS({
    projectId: input.projectId,
    text: segmentText,
    entries,
    language: input.language,
  });

  const cachePath = buildCacheObjectPath({
    projectId: input.projectId,
    chapterId: input.chapterId,
    chapterUpdatedAt: input.chapterUpdatedAt,
    language: input.language,
    voiceId: input.voiceId,
    rate: input.rate,
    segmentText: ssml,
    pronunciationProfileHash,
  });

  const file = getCachedBucket().file(cachePath);
  const [exists] = await file.exists();
  if (exists) {
    const [audioBuffer] = await file.download();
    let normalizedCachedBuffer: Buffer | null = null;
    if (looksLikeWavAudioBuffer(audioBuffer)) {
      normalizedCachedBuffer = Buffer.from(audioBuffer);
    } else {
      normalizedCachedBuffer = normalizeMpegAudioBuffer(audioBuffer);
    }
    if (normalizedCachedBuffer) {
      if (!Buffer.from(audioBuffer).equals(normalizedCachedBuffer)) {
        await uploadToCache(file, normalizedCachedBuffer).catch((error: unknown) => {
          console.warn("Failed to rewrite normalized cached Google TTS segment:", {
            cachePath,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      return {
        audioBuffer: normalizedCachedBuffer,
        contentType: "audio/mpeg",
        segmentCount: speechSegments.length,
        cacheHit: true,
      };
    }

    console.warn("Invalid cached Google TTS segment detected, regenerating:", {
      projectId: input.projectId,
      chapterId: input.chapterId,
      voiceId: input.voiceId,
      segmentIndex: input.segmentIndex,
      language: input.language,
      cachePath,
    });
    await file.delete({ ignoreNotFound: true }).catch((error: unknown) => {
      console.warn("Failed to delete invalid cached Google TTS segment:", {
        cachePath,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  // Try SSML synthesis
  try {
    const audioBuffer = await synthesizeWithSsml(
      client,
      ssml,
      input.language,
      input.voiceId,
      input.rate,
    );
    assertMpegAudioBuffer(audioBuffer, "synthesis");

    await uploadToCache(file, audioBuffer);

    return {
      audioBuffer,
      contentType: "audio/mpeg",
      segmentCount: speechSegments.length,
      cacheHit: false,
    };
  } catch (error) {
    // SSML failed — log and fallback to plain text
    console.error("SSML synthesis failed, falling back to plain text:", {
      projectId: input.projectId,
      chapterId: input.chapterId,
      voiceId: input.voiceId,
      segmentIndex: input.segmentIndex,
      language: input.language,
      error: error instanceof Error ? error.message : String(error),
    });

    const normalizedText = normalizeText(segmentText);
    const fallbackBuffer = await synthesizeWithText(
      client,
      normalizedText,
      input.language,
      input.voiceId,
      input.rate,
    );
    assertMpegAudioBuffer(fallbackBuffer, "synthesis");

    // Do NOT cache fallback under SSML key
    return {
      audioBuffer: fallbackBuffer,
      contentType: "audio/mpeg",
      segmentCount: speechSegments.length,
      cacheHit: false,
    };
  }
}
