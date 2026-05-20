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

function getTextToSpeechClient() {
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
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((id) => ({ id, label: formatVoiceOptionLabel(id), language }));

  if (voices.length === 0) {
    throw new Error(`No curated Google TTS voices configured for ${language}.`);
  }

  return voices;
}

function getConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  requireEnv("GOOGLE_APPLICATION_CREDENTIALS");

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
    return Buffer.from(audioContent, "base64");
  }

  return Buffer.from(audioContent);
}

function buildCacheObjectPath(input: {
  projectId: string;
  chapterId: string;
  chapterUpdatedAt: Date;
  language: ReaderLanguage;
  voiceId: string;
  rate: number;
  segmentText: string;
}) {
  const hash = createHash("sha256")
    .update(input.chapterId)
    .update(input.chapterUpdatedAt.toISOString())
    .update(input.language)
    .update(input.voiceId)
    .update(String(input.rate))
    .update(input.segmentText)
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

  const cachePath = buildCacheObjectPath({
    projectId: input.projectId,
    chapterId: input.chapterId,
    chapterUpdatedAt: input.chapterUpdatedAt,
    language: input.language,
    voiceId: input.voiceId,
    rate: input.rate,
    segmentText,
  });

  const file = getCachedBucket().file(cachePath);
  const [exists] = await file.exists();
  if (exists) {
    const [audioBuffer] = await file.download();
    return {
      audioBuffer,
      contentType: "audio/mpeg",
      segmentCount: speechSegments.length,
      cacheHit: true,
    };
  }

  const client = getTextToSpeechClient();
  const [response] = await client.synthesizeSpeech({
    input: { text: segmentText },
    voice: {
      languageCode: input.language,
      name: input.voiceId,
    },
    audioConfig: {
      audioEncoding: protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
      speakingRate: input.rate,
    },
  });

  const audioBuffer = toAudioBuffer(response.audioContent);

  await file.save(audioBuffer, {
    resumable: false,
    contentType: "audio/mpeg",
    metadata: {
      cacheControl: "private, max-age=31536000, immutable",
    },
  });

  return {
    audioBuffer,
    contentType: "audio/mpeg",
    segmentCount: speechSegments.length,
    cacheHit: false,
  };
}
