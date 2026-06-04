"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronUp, Loader2, Pause, Play, Square, Volume2, X } from "lucide-react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import {
  buildSpeechSegments,
  detectChapterLanguage,
  type ReaderLanguage,
  type ReaderLanguageMode,
  type VoiceOption,
  SPEECH_RATE_OPTIONS,
} from "@/lib/voiceReader";
import { usePreferencesStore } from "@/store/usePreferencesStore";

type PlaybackState = "idle" | "playing" | "paused";

type PublicVoiceReaderProps = {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterContent: string;
  isLoading: boolean;
};

type VoiceResponse = {
  voices?: VoiceOption[];
};

export type SegmentAudioSource = {
  index: number;
  objectUrl: string;
  contentType: string;
  byteLength: number;
  cacheStatus: string | null;
};

type PrefetchedSegment = SegmentAudioSource;

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

const EMPTY_VOICE_OPTIONS: Record<ReaderLanguage, VoiceOption[]> = {
  "en-US": [],
  "vi-VN": [],
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function getPlaybackErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
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

export function PublicVoiceReader({
  projectId,
  chapterId,
  chapterTitle,
  chapterContent,
  isLoading,
}: PublicVoiceReaderProps) {
  const isVietnamese = useLocale() === "vi";
  const readerLanguageMode = usePreferencesStore((state) => state.readerLanguageMode);
  const readerRate = usePreferencesStore((state) => state.readerRate);
  const readerVoiceEn = usePreferencesStore((state) => state.readerVoiceEn);
  const readerVoiceVi = usePreferencesStore((state) => state.readerVoiceVi);
  const setReaderLanguageMode = usePreferencesStore((state) => state.setReaderLanguageMode);
  const setReaderRate = usePreferencesStore((state) => state.setReaderRate);
  const setReaderVoice = usePreferencesStore((state) => state.setReaderVoice);

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [voicesByLanguage, setVoicesByLanguage] =
    useState<Record<ReaderLanguage, VoiceOption[]>>(EMPTY_VOICE_OPTIONS);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [voiceLoadError, setVoiceLoadError] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [currentSegmentNumber, setCurrentSegmentNumber] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackStateRef = useRef<PlaybackState>("idle");
  const playbackSessionIdRef = useRef(0);
  const currentSegmentIndexRef = useRef(0);
  const currentAudioUrlRef = useRef<string | null>(null);
  const currentAudioSourceRef = useRef<ActiveAudioSource | null>(null);
  const activeFetchAbortRef = useRef<AbortController | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);
  const prefetchedSegmentRef = useRef<PrefetchedSegment | null>(null);

  const speechSegments = buildSpeechSegments(chapterTitle, chapterContent);
  const detectedLanguage = detectChapterLanguage(speechSegments.join(" "));
  const languageLabel = (language: ReaderLanguage) =>
    language === "vi-VN"
      ? (isVietnamese ? "Tiếng Việt" : "Vietnamese")
      : (isVietnamese ? "Tiếng Anh" : "English");
  const playbackErrorFallback = isVietnamese
    ? "Không thể phát giọng đọc. Vui lòng thử lại."
    : "Voice playback failed. Please try again.";
  const activeLanguage: ReaderLanguage =
    readerLanguageMode === "auto" ? detectedLanguage : readerLanguageMode;
  const availableVoices = voicesByLanguage[activeLanguage] ?? [];
  const preferredVoiceId = activeLanguage === "vi-VN" ? readerVoiceVi : readerVoiceEn;
  const activeVoice = availableVoices.find((voice) => voice.id === preferredVoiceId) ?? availableVoices[0] ?? null;
  const helperStatusLabel =
    playbackState === "paused"
      ? (isVietnamese ? "Tạm dừng" : "Paused")
      : playbackState === "playing"
        ? (isVietnamese ? "Đang đọc" : "Reading")
        : (isVietnamese ? "Sẵn sàng" : "Ready");

  const unavailableReason =
    isLoading
      ? (isVietnamese
          ? "Đang tải chương hiện tại trước khi có thể bắt đầu phát."
          : "Loading the current chapter before playback can start.")
      : speechSegments.length === 0
        ? (isVietnamese
            ? "Chương này chưa có nội dung có thể đọc."
            : "This chapter does not have readable body content yet.")
        : isLoadingVoices
          ? (isVietnamese
              ? "Đang tải các giọng đọc Google Cloud đã tuyển chọn..."
              : "Loading curated Google Cloud voices...")
          : voiceLoadError
            ? voiceLoadError
            : !activeVoice
              ? (isVietnamese
                  ? `Chưa cấu hình giọng đọc Google ${languageLabel(activeLanguage)} đã tuyển chọn.`
                  : `No curated ${languageLabel(activeLanguage)} Google voice is configured.`)
              : null;

  const helperText =
    runtimeError ??
    unavailableReason ??
    (playbackState === "paused"
      ? (isVietnamese
          ? `Đã tạm dừng ở đoạn ${currentSegmentNumber} trên ${speechSegments.length}.`
          : `Paused at section ${currentSegmentNumber} of ${speechSegments.length}.`)
      : playbackState === "playing"
        ? (isVietnamese
            ? `Đang đọc đoạn ${currentSegmentNumber} trên ${speechSegments.length}.`
            : `Reading section ${currentSegmentNumber} of ${speechSegments.length}.`)
        : (isVietnamese
            ? `Sẵn sàng đọc ${speechSegments.length} đoạn từ chương này.`
            : `Ready to read ${speechSegments.length} section${speechSegments.length === 1 ? "" : "s"} from this chapter.`));

  const updatePlaybackState = useCallback((nextState: PlaybackState) => {
    playbackStateRef.current = nextState;
    setPlaybackState(nextState);
  }, []);

  const revokeObjectUrl = useCallback((objectUrl: string | null) => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }, []);

  const clearCurrentAudioSource = useCallback(() => {
    revokeObjectUrl(currentAudioUrlRef.current);
    currentAudioUrlRef.current = null;
    currentAudioSourceRef.current = null;
  }, [revokeObjectUrl]);

  const clearPrefetchedSegment = useCallback(() => {
    if (prefetchedSegmentRef.current) {
      revokeObjectUrl(prefetchedSegmentRef.current.objectUrl);
      prefetchedSegmentRef.current = null;
    }
  }, [revokeObjectUrl]);

  const clearPendingRequests = useCallback(() => {
    activeFetchAbortRef.current?.abort();
    activeFetchAbortRef.current = null;
    prefetchAbortRef.current?.abort();
    prefetchAbortRef.current = null;
  }, []);

  const resetPlaybackPosition = useCallback(() => {
    currentSegmentIndexRef.current = 0;
    setCurrentSegmentNumber(0);
  }, []);

  const stopPlayback = useCallback(
    (nextError: string | null = null) => {
      playbackSessionIdRef.current += 1;
      clearPendingRequests();

      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }

      clearCurrentAudioSource();
      clearPrefetchedSegment();
      resetPlaybackPosition();
      updatePlaybackState("idle");
      setRuntimeError(nextError);
    },
    [
      clearCurrentAudioSource,
      clearPendingRequests,
      clearPrefetchedSegment,
      resetPlaybackPosition,
      updatePlaybackState,
    ]
  );

  const requestSegmentAudio = useCallback(
    async (segmentIndex: number, signal?: AbortSignal) => {
      if (!activeVoice) {
        throw new Error("No Google Cloud voice is available for this language.");
      }

      const params = new URLSearchParams({
        projectId,
        chapterId,
        index: String(segmentIndex),
        lang: activeLanguage,
        voice: activeVoice.id,
        rate: String(readerRate),
      });

      const response = await fetch(`/api/voice-reader/segment?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        signal,
      });

      if (!response.ok) {
        throw new Error((await response.text()) || "Voice playback failed.");
      }

      return readSegmentAudioResponse(response, segmentIndex, isVietnamese);
    },
    [activeLanguage, activeVoice, chapterId, isVietnamese, projectId, readerRate]
  );

  const prefetchSegment = useCallback(
    (sessionId: number, segmentIndex: number) => {
      if (segmentIndex >= speechSegments.length || !activeVoice) {
        return;
      }

      if (prefetchedSegmentRef.current?.index === segmentIndex) {
        return;
      }

      prefetchAbortRef.current?.abort();
      const controller = new AbortController();
      prefetchAbortRef.current = controller;

      void requestSegmentAudio(segmentIndex, controller.signal)
        .then((segmentSource) => {
          if (playbackSessionIdRef.current !== sessionId) {
            revokeObjectUrl(segmentSource.objectUrl);
            return;
          }

          clearPrefetchedSegment();
          prefetchedSegmentRef.current = segmentSource;
        })
        .catch((error) => {
          if (!isAbortError(error)) {
            console.error("Voice segment prefetch failed:", error);
          }
        })
        .finally(() => {
          if (prefetchAbortRef.current === controller) {
            prefetchAbortRef.current = null;
          }
        });
    },
    [activeVoice, clearPrefetchedSegment, requestSegmentAudio, revokeObjectUrl, speechSegments.length]
  );

  const playSegment = useCallback(
    async (sessionId: number, segmentIndex: number) => {
      const audio = audioRef.current;
      if (!audio || !activeVoice) {
        stopPlayback("Voice playback is not available in this browser.");
        return;
      }

      if (segmentIndex >= speechSegments.length) {
        stopPlayback();
        return;
      }

      try {
        let nextSegmentSource: SegmentAudioSource;
        if (prefetchedSegmentRef.current?.index === segmentIndex) {
          nextSegmentSource = prefetchedSegmentRef.current;
          prefetchedSegmentRef.current = null;
        } else {
          activeFetchAbortRef.current?.abort();
          const controller = new AbortController();
          activeFetchAbortRef.current = controller;
          nextSegmentSource = await requestSegmentAudio(segmentIndex, controller.signal);

          if (playbackSessionIdRef.current !== sessionId) {
            revokeObjectUrl(nextSegmentSource.objectUrl);
            return;
          }

          if (activeFetchAbortRef.current === controller) {
            activeFetchAbortRef.current = null;
          }
        }

        currentSegmentIndexRef.current = segmentIndex;
        setCurrentSegmentNumber(segmentIndex + 1);
        setRuntimeError(null);

        audio.pause();
        clearCurrentAudioSource();
        currentAudioUrlRef.current = nextSegmentSource.objectUrl;
        currentAudioSourceRef.current = {
          index: nextSegmentSource.index,
          contentType: nextSegmentSource.contentType,
          byteLength: nextSegmentSource.byteLength,
          cacheStatus: nextSegmentSource.cacheStatus,
        };
        audio.src = nextSegmentSource.objectUrl;
        audio.currentTime = 0;
        await audio.play();
        updatePlaybackState("playing");

        prefetchSegment(sessionId, segmentIndex + 1);
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        const message =
          error instanceof Error && isBrowserMediaSourceErrorMessage(error.message)
            ? buildUnsupportedMediaMessage(isVietnamese, currentAudioSourceRef.current)
            : getPlaybackErrorMessage(error, playbackErrorFallback);
        stopPlayback(message);
      }
    },
    [
      activeVoice,
      clearCurrentAudioSource,
      isVietnamese,
      prefetchSegment,
      requestSegmentAudio,
      revokeObjectUrl,
      playbackErrorFallback,
      speechSegments.length,
      stopPlayback,
      updatePlaybackState,
    ]
  );

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    return () => {
      stopPlayback();
      audioRef.current = null;
    };
  }, [stopPlayback]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.onended = () => {
      const nextSegmentIndex = currentSegmentIndexRef.current + 1;
      if (nextSegmentIndex >= speechSegments.length) {
        stopPlayback();
        return;
      }

      void playSegment(playbackSessionIdRef.current, nextSegmentIndex);
    };

    audio.onerror = () => {
      if (playbackStateRef.current === "idle") {
        return;
      }

      stopPlayback(buildUnsupportedMediaMessage(isVietnamese, currentAudioSourceRef.current));
    };

    return () => {
      audio.onended = null;
      audio.onerror = null;
    };
  }, [isVietnamese, playSegment, speechSegments.length, stopPlayback]);

  useEffect(() => {
    const controller = new AbortController();
    const loadVoices = async () => {
      setIsLoadingVoices(true);
      setVoiceLoadError(null);

      try {
        const languages: ReaderLanguage[] = ["en-US", "vi-VN"];
        const voiceEntries = await Promise.all(
          languages.map(async (language) => {
            const params = new URLSearchParams({ projectId, lang: language });
            const response = await fetch(`/api/voice-reader/voices?${params.toString()}`, {
              method: "GET",
              cache: "no-store",
              signal: controller.signal,
            });

            if (!response.ok) {
              throw new Error((await response.text()) || "Failed to load Google Cloud voices.");
            }

            const json = (await response.json()) as VoiceResponse;
            return [language, Array.isArray(json.voices) ? json.voices : []] as const;
          })
        );

        setVoicesByLanguage({
          "en-US": voiceEntries.find(([language]) => language === "en-US")?.[1] ?? [],
          "vi-VN": voiceEntries.find(([language]) => language === "vi-VN")?.[1] ?? [],
        });
      } catch (error) {
        if (!isAbortError(error)) {
          setVoicesByLanguage(EMPTY_VOICE_OPTIONS);
          setVoiceLoadError(getPlaybackErrorMessage(error, playbackErrorFallback));
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingVoices(false);
        }
      }
    };

    void loadVoices();
    return () => controller.abort();
  }, [playbackErrorFallback, projectId]);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [chapterContent, chapterId, chapterTitle, projectId, stopPlayback]);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [readerLanguageMode, readerRate, readerVoiceEn, readerVoiceVi, stopPlayback]);

  useEffect(() => {
    const handlePageHide = () => {
      stopPlayback();
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [stopPlayback]);

  const handlePlay = () => {
    if (unavailableReason || speechSegments.length === 0) {
      return;
    }

    const sessionId = playbackSessionIdRef.current + 1;
    playbackSessionIdRef.current = sessionId;
    resetPlaybackPosition();
    void playSegment(sessionId, 0);
  };

  const handlePauseResume = async () => {
    const audio = audioRef.current;
    if (!audio || unavailableReason || playbackState === "idle") {
      return;
    }

    if (playbackState === "paused") {
      try {
        await audio.play();
        updatePlaybackState("playing");
        setRuntimeError(null);
      } catch (error) {
        stopPlayback(getPlaybackErrorMessage(error, playbackErrorFallback));
      }
      return;
    }

    audio.pause();
    updatePlaybackState("paused");
    setRuntimeError(null);
  };

  return (
    <>
      {isPanelOpen && (
        <button
          type="button"
          aria-label={isVietnamese ? "Đóng trình đọc giọng nói" : "Close voice reader"}
          onClick={() => setIsPanelOpen(false)}
          className="fixed inset-0 z-40 bg-[var(--color-text)]/20 sm:hidden"
        />
      )}

      {isPanelOpen && (
        <section
          className={cn(
            "fixed z-50 border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl",
            "inset-x-3 bottom-20 rounded-[30px] p-4",
            "sm:bottom-24 sm:right-4 sm:left-auto sm:w-[26rem] sm:rounded-[28px] sm:p-5"
          )}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[var(--color-text)]">
                  <Volume2 size={18} className="text-[var(--color-accent)]" />
                  <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                    {isVietnamese ? "Trình đọc giọng nói" : "Voice Reader"}
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {isVietnamese
                    ? "Giọng đọc Google Cloud chỉ áp dụng cho chương đang chọn."
                    : "Google Cloud speech for the selected chapter only."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsPanelOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-canvas)] hover:text-[var(--color-text)]"
                aria-label={isVietnamese ? "Đóng bảng trình đọc giọng nói" : "Close voice reader panel"}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]",
                  playbackState === "playing"
                    ? "bg-[var(--color-success)]/10 text-[var(--color-success)]"
                    : playbackState === "paused"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-[var(--color-canvas)] text-[var(--color-text-secondary)]"
                )}
              >
                {helperStatusLabel}
              </span>
              <span className="rounded-full bg-[var(--color-accent-muted)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-accent)]">
                {readerLanguageMode === "auto"
                  ? `${isVietnamese ? "Tự động" : "Auto"} ${languageLabel(detectedLanguage)}`
                  : languageLabel(activeLanguage)}
              </span>
              {isLoadingVoices && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-canvas)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                  <Loader2 size={12} className="animate-spin" />
                  {isVietnamese ? "Đang đồng bộ" : "Syncing"}
                </span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                  {isVietnamese ? "Ngôn ngữ" : "Language"}
                </span>
                <select
                  value={readerLanguageMode}
                  onChange={(event) => setReaderLanguageMode(event.target.value as ReaderLanguageMode)}
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-text)]"
                >
                  <option value="auto">{isVietnamese ? "Tự động phát hiện" : "Auto detect"}</option>
                  <option value="en-US">{isVietnamese ? "Tiếng Anh" : "English"}</option>
                  <option value="vi-VN">{isVietnamese ? "Tiếng Việt" : "Vietnamese"}</option>
                </select>
              </label>

              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                  {isVietnamese ? "Giọng đọc" : "Voice"}
                </span>
                <select
                  value={activeVoice?.id ?? ""}
                  onChange={(event) => setReaderVoice(activeLanguage, event.target.value)}
                  disabled={availableVoices.length === 0}
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-text)] disabled:cursor-not-allowed disabled:bg-[var(--color-canvas)] disabled:text-[var(--color-text-muted)]"
                >
                  {availableVoices.length === 0 ? (
                    <option value="">{isVietnamese ? "Chưa có giọng đọc tuyển chọn" : "No curated voice"}</option>
                  ) : (
                    availableVoices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                        {getVoiceDisplayLabel(voice, isVietnamese)}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                  {isVietnamese ? "Tốc độ" : "Speed"}
                </span>
                <select
                  value={String(readerRate)}
                  onChange={(event) => setReaderRate(Number(event.target.value))}
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-text)]"
                >
                  {SPEECH_RATE_OPTIONS.map((rateOption) => (
                    <option key={rateOption} value={String(rateOption)}>
                      {rateOption.toFixed(rateOption % 1 === 0 ? 0 : 2)}x
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap items-end gap-2">
                <button
                  type="button"
                  onClick={handlePlay}
                  disabled={Boolean(unavailableReason)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--color-text)] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--color-text)] disabled:cursor-not-allowed disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-secondary)]"
                >
                  <Play size={16} />
                  {isVietnamese ? "Phát" : "Play"}
                </button>
                <button
                  type="button"
                  onClick={() => void handlePauseResume()}
                  disabled={Boolean(unavailableReason) || playbackState === "idle"}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-canvas)] disabled:cursor-not-allowed disabled:bg-[var(--color-canvas)] disabled:text-[var(--color-text-muted)]"
                >
                  <Pause size={16} />
                  {playbackState === "paused"
                    ? (isVietnamese ? "Tiếp tục" : "Resume")
                    : (isVietnamese ? "Tạm dừng" : "Pause")}
                </button>
                <button
                  type="button"
                  onClick={() => stopPlayback()}
                  disabled={playbackState === "idle"}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-canvas)] disabled:cursor-not-allowed disabled:bg-[var(--color-canvas)] disabled:text-[var(--color-text-muted)]"
                >
                  <Square size={14} />
                  {isVietnamese ? "Dừng" : "Stop"}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-2xl bg-[var(--color-canvas)] px-4 py-3">
              <p className="text-sm text-[var(--color-text-secondary)]">{helperText}</p>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                {isVietnamese ? "Chỉ chương đã chọn" : "Selected chapter only"}
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="fixed bottom-4 right-4 z-50">
        <button
          type="button"
          onClick={() => setIsPanelOpen((value) => !value)}
          aria-expanded={isPanelOpen}
          className={cn(
            "group inline-flex items-center gap-3 rounded-[24px] border px-4 py-3 shadow-lg backdrop-blur transition-all",
            playbackState === "playing"
              ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]"
              : playbackState === "paused"
                ? "border-amber-200 bg-amber-50/95 text-amber-900"
                : "border-[var(--color-border)] bg-[var(--color-surface)]/95 text-[var(--color-text)] hover:bg-[var(--color-surface)]"
          )}
        >
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-2xl",
              playbackState === "playing"
                ? "bg-[var(--color-success)]/10 text-[var(--color-success)]"
                : playbackState === "paused"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
            )}
          >
            <Volume2 size={18} />
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
              Voice Reader
            </span>
            <span className="block text-sm font-semibold">
              {playbackState === "playing"
                ? `Reading ${currentSegmentNumber}/${speechSegments.length}`
                : playbackState === "paused"
                  ? `Paused ${currentSegmentNumber}/${speechSegments.length}`
                  : "Open controls"}
            </span>
          </span>
          <ChevronUp
            size={18}
            className={cn("text-[var(--color-text-muted)] transition-transform", isPanelOpen && "rotate-180")}
          />
        </button>
      </div>
    </>
  );
}
