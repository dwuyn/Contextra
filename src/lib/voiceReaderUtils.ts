export type VoiceOption = {
  id: string;
  label: string;
  language: string;
};

export type ReaderLanguage = "en-US" | "vi-VN";

export type ReaderLanguageMode = ReaderLanguage | "auto";

export type SegmentAudioSource = {
  index: number;
  objectUrl: string;
  contentType: string;
  byteLength: number;
  cacheStatus: string | null;
};

export type ActiveAudioSource = Omit<SegmentAudioSource, "objectUrl">;

function normalizeContentType(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function summarizeTextDetail(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

export function buildUnexpectedAudioResponseMessage(isVietnamese: boolean, contentType: string, detail: string | null) {
  const fallbackType = contentType || (isVietnamese ? "không rõ kiểu dữ liệu" : "unknown content type");
  const prefix = isVietnamese
    ? `Trình đọc giọng nói nhận về ${fallbackType} thay vì âm thanh.`
    : `Voice reader returned ${fallbackType} instead of audio.`;

  return detail ? `${prefix} ${detail}` : prefix;
}

export function buildEmptyAudioResponseMessage(isVietnamese: boolean) {
  return isVietnamese
    ? "Trình đọc giọng nói trả về tệp âm thanh rỗng."
    : "Voice reader returned an empty audio file.";
}

export function isBrowserMediaSourceErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("no supported source") ||
    normalized.includes("not suitable") ||
    normalized.includes("media resource indicated by the src attribute") ||
    normalized.includes("assigned media provider object was not suitable")
  );
}

export function buildUnsupportedMediaMessage(
  isVietnamese: boolean,
  source: ActiveAudioSource | null,
) {
  if (!source) {
    return isVietnamese
      ? "Trình duyệt không giải mã được âm thanh đã nhận. Hãy kiểm tra phản hồi localhost từ /api/voice-reader/segment."
      : "The browser could not decode the returned audio. Check the localhost /api/voice-reader/segment response.";
  }

  const parts = [source.contentType || "unknown content type", `${source.byteLength} bytes`];
  if (source.cacheStatus) {
    parts.push(`cache ${source.cacheStatus}`);
  }

  const summary = parts.join(", ");
  return isVietnamese
    ? `Đoạn ${source.index + 1} trả về ${summary}, nhưng trình duyệt không giải mã được âm thanh. Hãy kiểm tra phản hồi localhost từ /api/voice-reader/segment.`
    : `Segment ${source.index + 1} returned ${summary}, but the browser could not decode the audio. Check the localhost /api/voice-reader/segment response.`;
}

export async function readSegmentAudioResponse(
  response: Response,
  segmentIndex: number,
  isVietnamese: boolean,
): Promise<SegmentAudioSource> {
  const responseContentType = normalizeContentType(response.headers.get("Content-Type"));
  if (!responseContentType.startsWith("audio/")) {
    const detail = summarizeTextDetail(await response.text());
    throw new Error(buildUnexpectedAudioResponseMessage(isVietnamese, responseContentType, detail));
  }

  const blob = await response.blob();
  const blobContentType = normalizeContentType(blob.type || responseContentType);
  if (!blobContentType.startsWith("audio/")) {
    throw new Error(buildUnexpectedAudioResponseMessage(isVietnamese, blobContentType, null));
  }

  if (blob.size === 0) {
    throw new Error(buildEmptyAudioResponseMessage(isVietnamese));
  }

  return {
    index: segmentIndex,
    objectUrl: URL.createObjectURL(blob),
    contentType: blobContentType,
    byteLength: blob.size,
    cacheStatus: response.headers.get("X-Voice-Reader-Cache"),
  };
}

export function getVoiceDisplayLabel(voice: VoiceOption, isVietnamese: boolean) {
  const normalizedId = voice.id.toLowerCase();

  if (
    normalizedId.endsWith("-a") ||
    normalizedId.endsWith("-f") ||
    normalizedId.endsWith("-h") ||
    normalizedId.endsWith("-aoede")
  ) {
    return isVietnamese ? "Nữ" : "Female";
  }

  if (
    normalizedId.endsWith("-d") ||
    normalizedId.endsWith("-i") ||
    normalizedId.endsWith("-j") ||
    normalizedId.endsWith("-charon")
  ) {
    return isVietnamese ? "Nam" : "Male";
  }

  return voice.label;
}
