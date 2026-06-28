export type ReaderLanguage = "en-US" | "vi-VN";

export interface VoiceOption {
  id: string;
  label: string;
  language: ReaderLanguage;
}

const READABLE_BLOCK_CLOSE_TAG_PATTERN = /<\/(h[1-6]|p|li|blockquote|pre|div|section|article)>/gi;
const BREAK_TAG_PATTERN = /<br\s*\/?>/gi;
const HTML_TAG_PATTERN = /<[^>]+>/g;
const SENTENCE_SEGMENT_PATTERN = /[^.!?…]+(?:[.!?…]+|$)/g;
const MAX_UTTERANCE_LENGTH = 260;

export const SPEECH_RATE_OPTIONS = [0.8, 1, 1.15, 1.3, 1.5] as const;

export function normalizeWhitespace(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function isReaderLanguage(value: string): value is ReaderLanguage {
  return value === "en-US" || value === "vi-VN";
}

export function isSupportedSpeechRate(value: number) {
  return SPEECH_RATE_OPTIONS.includes(value as (typeof SPEECH_RATE_OPTIONS)[number]);
}

export function getLocaleDefaultReaderLanguage(locale: string): ReaderLanguage {
  return locale.startsWith("vi") ? "vi-VN" : "en-US";
}

function splitByWhitespaceLimit(text: string) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];
  if (normalized.length <= MAX_UTTERANCE_LENGTH) return [normalized];

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > MAX_UTTERANCE_LENGTH) {
    let splitIndex = remaining.lastIndexOf(" ", MAX_UTTERANCE_LENGTH);
    if (splitIndex <= 0 || splitIndex < Math.floor(MAX_UTTERANCE_LENGTH * 0.55)) {
      splitIndex = remaining.indexOf(" ", MAX_UTTERANCE_LENGTH);
    }
    if (splitIndex <= 0) {
      splitIndex = Math.min(MAX_UTTERANCE_LENGTH, remaining.length);
    }

    const chunk = normalizeWhitespace(remaining.slice(0, splitIndex));
    if (chunk) {
      chunks.push(chunk);
    }

    remaining = normalizeWhitespace(remaining.slice(splitIndex));
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function mergeClauseChunks(parts: string[]) {
  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    const normalized = normalizeWhitespace(part);
    if (!normalized) continue;

    if (normalized.length > MAX_UTTERANCE_LENGTH) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(...splitByWhitespaceLimit(normalized));
      continue;
    }

    const next = current ? `${current} ${normalized}` : normalized;
    if (next.length > MAX_UTTERANCE_LENGTH && current) {
      chunks.push(current);
      current = normalized;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function splitByClauseBoundaries(text: string) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const parts: string[] = [];
  let buffer = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    const next = normalized[index + 1] ?? "";
    buffer += current;

    const isClauseBoundary =
      current === "," ||
      current === ";" ||
      current === ":" ||
      current === ")" ||
      current === "]" ||
      current === "}" ||
      current === "…" ||
      ((current === "-" || current === "–" || current === "—") &&
        index > 0 &&
        index < normalized.length - 1 &&
        normalized[index - 1] === " " &&
        next === " ");

    const isEllipsisBoundary =
      current === "." && normalized.slice(index, index + 3) === "...";

    if (isClauseBoundary || isEllipsisBoundary) {
      if (isEllipsisBoundary) {
        buffer += "..";
      }

      const chunk = normalizeWhitespace(buffer);
      if (chunk) {
        parts.push(chunk);
      }
      buffer = "";

      if (isEllipsisBoundary) {
        index += 2;
      }
    }
  }

  const trailing = normalizeWhitespace(buffer);
  if (trailing) {
    parts.push(trailing);
  }

  return parts;
}

function splitLongSentence(sentence: string) {
  const normalized = normalizeWhitespace(sentence);
  if (!normalized) return [];
  if (normalized.length <= MAX_UTTERANCE_LENGTH) return [normalized];

  const clauseParts = splitByClauseBoundaries(normalized);
  if (clauseParts.length > 1) {
    return mergeClauseChunks(clauseParts);
  }

  return splitByWhitespaceLimit(normalized);
}

function segmentSentences(text: string) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const regexSegments = normalized.match(SENTENCE_SEGMENT_PATTERN);
  if (!regexSegments) {
    return [normalized];
  }

  return regexSegments.flatMap((segment) => {
    const trimmed = normalizeWhitespace(segment);
    return trimmed ? [trimmed] : [];
  });
}

function toSpeechSegments(text: string) {
  return segmentSentences(text).flatMap((sentence) => splitLongSentence(sentence));
}

function extractSpeechBlocks(html: string) {
  const normalizedHtml = html.trim();
  if (!normalizedHtml) return [];

  const plainText = normalizedHtml
    .replace(READABLE_BLOCK_CLOSE_TAG_PATTERN, "\n")
    .replace(BREAK_TAG_PATTERN, "\n")
    .replace(HTML_TAG_PATTERN, " ");

  return plainText
    .split(/\n+/)
    .flatMap((block) => {
      const trimmed = normalizeWhitespace(block);
      return trimmed ? [trimmed] : [];
    });
}

export function buildSpeechSegments(chapterTitle: string, chapterContent: string) {
  const bodyBlocks = extractSpeechBlocks(chapterContent);
  if (bodyBlocks.length === 0) {
    return [];
  }

  const titleSegments = toSpeechSegments(chapterTitle);
  const bodySegments = bodyBlocks.flatMap((block) => toSpeechSegments(block));
  return [...titleSegments, ...bodySegments];
}

export function formatVoiceOptionLabel(voiceId: string) {
  const parts = voiceId.split("-");
  if (parts.length >= 3) {
    return `Google ${parts.slice(2).join(" ")}`;
  }

  return voiceId;
}
