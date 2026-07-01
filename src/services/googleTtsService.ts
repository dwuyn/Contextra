import "@/lib/server-only";

import { createHash } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import {
  buildSpeechSegments,
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

function getConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = {
    bucketName: requireEnv("GOOGLE_TTS_CACHE_BUCKET"),
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

function assertMpegAudioBuffer(audioBuffer: Uint8Array, source: "cache" | "synthesis") {
  if (looksLikeWavAudioBuffer(audioBuffer)) {
    return;
  }
  if (!normalizeMpegAudioBuffer(audioBuffer)) {
    throw new Error(
      source === "cache"
        ? "Cached voice segment is not valid audio."
        : "Google Cloud TTS returned invalid audio.",
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
    .update("google-cloud-tts-v1")
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
    "voice-reader-v2",
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

export async function isConfiguredVoice(language: ReaderLanguage, voiceId: string): Promise<boolean> {
  try {
    const voices = await listAvailableVoices(language);
    return voices.some((voice) => voice.id === voiceId);
  } catch (error) {
    console.error("Error validating voice config:", error);
    return false;
  }
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
  return entries as PronunciationEntryData[];
}

export async function synthesizeWithSsml(
  client: TextToSpeechClient,
  ssml: string,
  language: ReaderLanguage,
  voiceId: string,
  rate: number,
): Promise<Buffer> {
  try {
    const [response] = await client.synthesizeSpeech({
      input: { ssml },
      voice: { languageCode: language, name: voiceId },
      audioConfig: { audioEncoding: "MP3", speakingRate: rate },
    });

    const content = response.audioContent;
    if (!content) {
      throw new Error("Google Cloud TTS returned empty audio.");
    }
    return typeof content === "string"
      ? Buffer.from(content, "base64")
      : Buffer.from(content);
  } catch (error) {
    console.error("Google Cloud TTS synthesis error:", error);
    throw error;
  }
}

export async function synthesizeWithText(
  client: TextToSpeechClient,
  text: string,
  language: ReaderLanguage,
  voiceId: string,
  rate: number,
): Promise<Buffer> {
  try {
    const [response] = await client.synthesizeSpeech({
      input: { text },
      voice: { languageCode: language, name: voiceId },
      audioConfig: { audioEncoding: "MP3", speakingRate: rate },
    });

    const content = response.audioContent;
    if (!content) {
      throw new Error("Google Cloud TTS returned empty audio.");
    }
    return typeof content === "string"
      ? Buffer.from(content, "base64")
      : Buffer.from(content);
  } catch (error) {
    console.error("Google Cloud TTS synthesis error:", error);
    throw error;
  }
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

type CacheEntry = {
  voices: VoiceOption[];
  expiresAt: number;
};

const voiceListCache: Record<string, CacheEntry> = {};

export function clearVoiceListCache() {
  for (const key of Object.keys(voiceListCache)) {
    delete voiceListCache[key];
  }
}

export async function listAvailableVoices(language: ReaderLanguage): Promise<VoiceOption[]> {
  const now = Date.now();
  const cached = voiceListCache[language];

  if (cached && cached.expiresAt > now) {
    return cached.voices;
  }

  try {
    const client = getTextToSpeechClient();
    const [response] = await client.listVoices({ languageCode: language });
    const rawVoices = response.voices || [];

    const mappedVoices: VoiceOption[] = [];
    const seenNames = new Set<string>();

    for (const v of rawVoices) {
      if (!v.name) continue;
      if (seenNames.has(v.name)) continue;
      seenNames.add(v.name);

      const parts = v.name.split("-");
      const family = parts[2] || "";
      const familyLower = family.toLowerCase();

      // The voice reader only exposes Neural2 voices.
      if (familyLower !== "neural2") continue;

      const gender = v.ssmlGender || undefined;
      const sampleRateHertz = v.naturalSampleRateHertz || undefined;

      mappedVoices.push({
        id: v.name,
        label: "", // Will be set after sorting
        language,
        gender,
        family,
        sampleRateHertz,
      });
    }

    mappedVoices.sort((a, b) => {
      return a.id.localeCompare(b.id);
    });

    for (const voice of mappedVoices) {
      const g = (voice.gender || "").toUpperCase();
      if (g === "FEMALE" || g === "SSML_VOICE_GENDER_FEMALE") {
        voice.label = "Female";
      } else if (g === "MALE" || g === "SSML_VOICE_GENDER_MALE") {
        voice.label = "Male";
      } else {
        voice.label = "Voice";
      }
    }

    voiceListCache[language] = {
      voices: mappedVoices,
      expiresAt: now + 12 * 60 * 60 * 1000,
    };

    return mappedVoices;
  } catch (error) {
    console.error(`Failed to list voices from Google Cloud TTS for language ${language}:`, error);
    if (cached) {
      console.warn(`Returning stale voice list cache for language ${language}.`);
      return cached.voices;
    }
    throw error;
  }
}

export async function synthesizeChapterSegment(input: SynthesizeSegmentInput) {
  if (!isReaderLanguage(input.language)) {
    throw new Error("Unsupported reader language.");
  }

  if (!isSupportedSpeechRate(input.rate)) {
    throw new Error("Unsupported reader speed.");
  }

  if (!(await isConfiguredVoice(input.language, input.voiceId))) {
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
          console.warn("Failed to rewrite normalized cached Google Cloud TTS segment:", {
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

    console.warn("Invalid cached Google Cloud TTS segment detected, regenerating:", {
      projectId: input.projectId,
      chapterId: input.chapterId,
      voiceId: input.voiceId,
      segmentIndex: input.segmentIndex,
      language: input.language,
      cachePath,
    });
    await file.delete({ ignoreNotFound: true }).catch((error: unknown) => {
      console.warn("Failed to delete invalid cached Google Cloud TTS segment:", {
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

    return {
      audioBuffer: fallbackBuffer,
      contentType: "audio/mpeg",
      segmentCount: speechSegments.length,
      cacheHit: false,
    };
  }
}
