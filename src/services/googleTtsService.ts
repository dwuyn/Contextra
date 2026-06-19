import "@/lib/server-only";

import { createHash } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { TextToSpeechClient, protos } from "@google-cloud/text-to-speech";
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
let cachedTtsClient: TextToSpeechClient | null = null;

function getGoogleClientOptions() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  return projectId ? { projectId } : undefined;
}

function getStorageClient() {
  cachedStorage ??= new Storage(getGoogleClientOptions());
  return cachedStorage;
}

export function getTextToSpeechClient() {
  cachedTtsClient ??= new TextToSpeechClient(getGoogleClientOptions());
  return cachedTtsClient;
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

function toAudioBuffer(audioContent: Uint8Array | string | null | undefined) {
  if (!audioContent) {
    throw new Error("Google TTS returned empty audio.");
  }

  if (typeof audioContent === "string") {
    const decodedBuffer = Buffer.from(audioContent, "base64");
    const normalizedBuffer = normalizeMpegAudioBuffer(decodedBuffer);
    if (normalizedBuffer) {
      return normalizedBuffer;
    }
    throw new Error("Google TTS returned non-MP3 audio.");
  }

  const normalizedBuffer = normalizeMpegAudioBuffer(audioContent);
  if (normalizedBuffer) {
    return normalizedBuffer;
  }

  throw new Error("Google TTS returned non-MP3 audio.");
}

function assertMpegAudioBuffer(audioBuffer: Uint8Array, source: "cache" | "synthesis") {
  if (!normalizeMpegAudioBuffer(audioBuffer)) {
    throw new Error(
      source === "cache"
        ? "Cached voice segment is not valid MP3 audio."
        : "Google TTS returned non-MP3 audio.",
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

export async function synthesizeWithSsml(
  client: TextToSpeechClient,
  ssml: string,
  language: ReaderLanguage,
  voiceId: string,
  rate: number,
) {
  const [response] = await client.synthesizeSpeech({
    input: { ssml },
    voice: {
      languageCode: language,
      name: voiceId,
    },
    audioConfig: {
      audioEncoding: protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
      speakingRate: rate,
    },
  });
  return toAudioBuffer(response.audioContent);
}

export async function synthesizeWithText(
  client: TextToSpeechClient,
  text: string,
  language: ReaderLanguage,
  voiceId: string,
  rate: number,
) {
  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: language,
      name: voiceId,
    },
    audioConfig: {
      audioEncoding: protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
      speakingRate: rate,
    },
  });
  return toAudioBuffer(response.audioContent);
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
    const normalizedCachedBuffer = normalizeMpegAudioBuffer(audioBuffer);
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
