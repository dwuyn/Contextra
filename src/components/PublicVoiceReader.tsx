"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronUp, Loader2, Pause, Play, Square, Volume2, X } from "lucide-react";
import { useLocale } from "next-intl";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import {
  buildSpeechSegments,
  detectChapterLanguage,
  type ReaderLanguage,
  type ReaderLanguageMode,
  type VoiceOption,
  SPEECH_RATE_OPTIONS,
} from "@/lib/voiceReader";
import {
  buildUnsupportedMediaMessage,
  isBrowserMediaSourceErrorMessage,
  readSegmentAudioResponse,
  getVoiceDisplayLabel,
  type SegmentAudioSource,
  type ActiveAudioSource,
} from "@/lib/voiceReaderUtils";
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

type PrefetchedSegment = SegmentAudioSource;

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

async function loadVoiceOptions(projectId: string) {
  const languages: ReaderLanguage[] = ["en-US", "vi-VN"];
  const voiceEntries = await Promise.all(
    languages.map(async (language) => {
      const params = new URLSearchParams({ projectId, lang: language });
      const response = await fetch(`/api/voice-reader/voices?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error((await response.text()) || "Failed to load Google Cloud voices.");
      }

      const json = (await response.json()) as VoiceResponse;
      return [language, Array.isArray(json.voices) ? json.voices : []] as const;
    })
  );

  return {
    "en-US": voiceEntries.find(([language]) => language === "en-US")?.[1] ?? [],
    "vi-VN": voiceEntries.find(([language]) => language === "vi-VN")?.[1] ?? [],
  } satisfies Record<ReaderLanguage, VoiceOption[]>;
}

function useVoiceReader(props: PublicVoiceReaderProps) {
  const { projectId, chapterId, chapterTitle, chapterContent, isLoading } = props;
  const isVietnamese = useLocale() === "vi";
  const readerLanguageMode = usePreferencesStore((state) => state.readerLanguageMode);
  const readerRate = usePreferencesStore((state) => state.readerRate);
  const readerVoiceEn = usePreferencesStore((state) => state.readerVoiceEn);
  const readerVoiceVi = usePreferencesStore((state) => state.readerVoiceVi);
  const setReaderLanguageMode = usePreferencesStore((state) => state.setReaderLanguageMode);
  const setReaderRate = usePreferencesStore((state) => state.setReaderRate);
  const setReaderVoice = usePreferencesStore((state) => state.setReaderVoice);

  const [isPanelOpen, setIsPanelOpen] = useState(false);
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
    language === "vi-VN" ? (isVietnamese ? "Tiếng Việt" : "Vietnamese") : (isVietnamese ? "Tiếng Anh" : "English");
  const playbackErrorFallback = isVietnamese ? "Không thể phát giọng đọc. Vui lòng thử lại." : "Voice playback failed. Please try again.";
  const {
    data: voicesByLanguage = EMPTY_VOICE_OPTIONS,
    error: voiceLoadFailure,
    isLoading: isLoadingVoices,
  } = useSWR<Record<ReaderLanguage, VoiceOption[]>, Error>(
    projectId ? ["voice-reader-voices", projectId] : null,
    ([, currentProjectId]) => loadVoiceOptions(currentProjectId),
    {
      revalidateOnFocus: false,
    }
  );
  const voiceLoadError = voiceLoadFailure ? getPlaybackErrorMessage(voiceLoadFailure, playbackErrorFallback) : null;
  const activeLanguage: ReaderLanguage = readerLanguageMode === "auto" ? detectedLanguage : readerLanguageMode;
  const availableVoices = voicesByLanguage[activeLanguage] ?? [];
  const preferredVoiceId = activeLanguage === "vi-VN" ? readerVoiceVi : readerVoiceEn;
  const activeVoice = availableVoices.find((voice) => voice.id === preferredVoiceId) ?? availableVoices[0] ?? null;

  const helperStatusLabel = playbackState === "paused" ? (isVietnamese ? "Tạm dừng" : "Paused") : playbackState === "playing" ? (isVietnamese ? "Đang đọc" : "Reading") : (isVietnamese ? "Sẵn sàng" : "Ready");

  const unavailableReason = isLoading ? (isVietnamese ? "Đang tải chương hiện tại trước khi có thể bắt đầu phát." : "Loading the current chapter before playback can start.") : speechSegments.length === 0 ? (isVietnamese ? "Chương này chưa có nội dung có thể đọc." : "This chapter does not have readable body content yet.") : isLoadingVoices ? (isVietnamese ? "Đang tải các giọng đọc Google Cloud đã tuyển chọn..." : "Loading curated Google Cloud voices...") : voiceLoadError ? voiceLoadError : !activeVoice ? (isVietnamese ? `Chưa cấu hình giọng đọc Google ${languageLabel(activeLanguage)} đã tuyển chọn.` : `No curated ${languageLabel(activeLanguage)} Google voice is configured.`) : null;

  const helperText = runtimeError ?? unavailableReason ?? (playbackState === "paused" ? (isVietnamese ? `Đã tạm dừng ở đoạn ${currentSegmentNumber} trên ${speechSegments.length}.` : `Paused at section ${currentSegmentNumber} of ${speechSegments.length}.`) : playbackState === "playing" ? (isVietnamese ? `Đang đọc đoạn ${currentSegmentNumber} trên ${speechSegments.length}.` : `Reading section ${currentSegmentNumber} of ${speechSegments.length}.`) : (isVietnamese ? `Sẵn sàng đọc ${speechSegments.length} đoạn từ chương này.` : `Ready to read ${speechSegments.length} section${speechSegments.length === 1 ? "" : "s"} from this chapter.`));

  const updatePlaybackState = useCallback((nextState: PlaybackState) => {
    playbackStateRef.current = nextState;
    setPlaybackState(nextState);
  }, []);

  const revokeObjectUrl = useCallback((objectUrl: string | null) => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
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

  const stopPlayback = useCallback((nextError: string | null = null) => {
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
  }, [clearCurrentAudioSource, clearPendingRequests, clearPrefetchedSegment, resetPlaybackPosition, updatePlaybackState]);

  const requestSegmentAudio = useCallback(async (segmentIndex: number, signal?: AbortSignal) => {
    if (!activeVoice) throw new Error("No Google Cloud voice is available for this language.");

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

    if (!response.ok) throw new Error((await response.text()) || "Voice playback failed.");

    return readSegmentAudioResponse(response, segmentIndex, isVietnamese);
  }, [activeLanguage, activeVoice, chapterId, isVietnamese, projectId, readerRate]);

  const prefetchSegment = useCallback((sessionId: number, segmentIndex: number) => {
    if (segmentIndex >= speechSegments.length || !activeVoice) return;
    if (prefetchedSegmentRef.current?.index === segmentIndex) return;

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
        if (!isAbortError(error)) console.error("Voice segment prefetch failed:", error);
      })
      .finally(() => {
        if (prefetchAbortRef.current === controller) prefetchAbortRef.current = null;
      });
  }, [activeVoice, clearPrefetchedSegment, requestSegmentAudio, revokeObjectUrl, speechSegments.length]);

  const playSegment = useCallback(async (sessionId: number, segmentIndex: number) => {
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

        if (activeFetchAbortRef.current === controller) activeFetchAbortRef.current = null;
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
      if (isAbortError(error)) return;
      const message = error instanceof Error && isBrowserMediaSourceErrorMessage(error.message) ? buildUnsupportedMediaMessage(isVietnamese, currentAudioSourceRef.current) : getPlaybackErrorMessage(error, playbackErrorFallback);
      stopPlayback(message);
    }
  }, [activeVoice, clearCurrentAudioSource, isVietnamese, prefetchSegment, requestSegmentAudio, revokeObjectUrl, playbackErrorFallback, speechSegments.length, stopPlayback, updatePlaybackState]);

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
    if (!audio) return;

    audio.onended = () => {
      const nextSegmentIndex = currentSegmentIndexRef.current + 1;
      if (nextSegmentIndex >= speechSegments.length) {
        stopPlayback();
        return;
      }
      void playSegment(playbackSessionIdRef.current, nextSegmentIndex);
    };

    audio.onerror = () => {
      if (playbackStateRef.current === "idle") return;
      stopPlayback(buildUnsupportedMediaMessage(isVietnamese, currentAudioSourceRef.current));
    };

    return () => {
      audio.onended = null;
      audio.onerror = null;
    };
  }, [isVietnamese, playSegment, speechSegments.length, stopPlayback]);

  useEffect(() => {
    return () => { stopPlayback(); };
  }, [chapterContent, chapterId, chapterTitle, projectId, stopPlayback]);

  useEffect(() => {
    return () => { stopPlayback(); };
  }, [readerLanguageMode, readerRate, readerVoiceEn, readerVoiceVi, stopPlayback]);

  useEffect(() => {
    const handlePageHide = () => { stopPlayback(); };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [stopPlayback]);

  const handlePlay = () => {
    if (unavailableReason || speechSegments.length === 0) return;
    const sessionId = playbackSessionIdRef.current + 1;
    playbackSessionIdRef.current = sessionId;
    resetPlaybackPosition();
    void playSegment(sessionId, 0);
  };

  const handlePauseResume = async () => {
    const audio = audioRef.current;
    if (!audio || unavailableReason || playbackState === "idle") return;
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

  return {
    isVietnamese,
    readerLanguageMode,
    readerRate,
    setReaderLanguageMode,
    setReaderRate,
    setReaderVoice,
    isPanelOpen,
    setIsPanelOpen,
    isLoadingVoices,
    playbackState,
    currentSegmentNumber,
    speechSegments,
    detectedLanguage,
    languageLabel,
    activeLanguage,
    availableVoices,
    activeVoice,
    helperStatusLabel,
    unavailableReason,
    helperText,
    handlePlay,
    handlePauseResume,
    stopPlayback,
  };
}

function PublicVoiceReaderPanel({ reader }: { reader: ReturnType<typeof useVoiceReader> }) {
  return (
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
                {reader.isVietnamese ? "Trình đọc giọng nói" : "Voice Reader"}
              </h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {reader.isVietnamese ? "Giọng đọc Google Cloud chỉ áp dụng cho chương đang chọn." : "Google Cloud speech for the selected chapter only."}
            </p>
          </div>
          <button type="button" onClick={() => reader.setIsPanelOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-canvas)] hover:text-[var(--color-text)]" aria-label={reader.isVietnamese ? "Đóng bảng trình đọc giọng nói" : "Close voice reader panel"}>
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]", reader.playbackState === "playing" ? "bg-[var(--color-success)]/10 text-[var(--color-success)]" : reader.playbackState === "paused" ? "bg-amber-100 text-amber-700" : "bg-[var(--color-canvas)] text-[var(--color-text-secondary)]")}>
            {reader.helperStatusLabel}
          </span>
          <span className="rounded-full bg-[var(--color-accent-muted)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            {reader.readerLanguageMode === "auto" ? `${reader.isVietnamese ? "Tự động" : "Auto"} ${reader.languageLabel(reader.detectedLanguage)}` : reader.languageLabel(reader.activeLanguage)}
          </span>
          {reader.isLoadingVoices && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-canvas)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
              <Loader2 size={12} className="animate-spin" /> {reader.isVietnamese ? "Đang đồng bộ" : "Syncing"}
            </span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">{reader.isVietnamese ? "Ngôn ngữ" : "Language"}</span>
            <select value={reader.readerLanguageMode} onChange={(e) => reader.setReaderLanguageMode(e.target.value as ReaderLanguageMode)} className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-text)]">
              <option value="auto">{reader.isVietnamese ? "Tự động phát hiện" : "Auto detect"}</option>
              <option value="en-US">{reader.isVietnamese ? "Tiếng Anh" : "English"}</option>
              <option value="vi-VN">{reader.isVietnamese ? "Tiếng Việt" : "Vietnamese"}</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">{reader.isVietnamese ? "Giọng đọc" : "Voice"}</span>
            <select value={reader.activeVoice?.id ?? ""} onChange={(e) => reader.setReaderVoice(reader.activeLanguage, e.target.value)} disabled={reader.availableVoices.length === 0} className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-text)] disabled:cursor-not-allowed disabled:bg-[var(--color-canvas)] disabled:text-[var(--color-text-muted)]">
              {reader.availableVoices.length === 0 ? <option value="">{reader.isVietnamese ? "Chưa có giọng đọc tuyển chọn" : "No curated voice"}</option> : reader.availableVoices.map((voice) => <option key={voice.id} value={voice.id}>{getVoiceDisplayLabel(voice, reader.isVietnamese)}</option>)}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">{reader.isVietnamese ? "Tốc độ" : "Speed"}</span>
            <select value={String(reader.readerRate)} onChange={(e) => reader.setReaderRate(Number(e.target.value))} className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-text)]">
              {SPEECH_RATE_OPTIONS.map((rateOption) => <option key={rateOption} value={String(rateOption)}>{rateOption.toFixed(rateOption % 1 === 0 ? 0 : 2)}x</option>)}
            </select>
          </label>

          <div className="flex flex-wrap items-end gap-2">
            <button type="button" onClick={reader.handlePlay} disabled={Boolean(reader.unavailableReason)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--color-text)] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--color-text)] disabled:cursor-not-allowed disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-secondary)]">
              <Play size={16} /> {reader.isVietnamese ? "Phát" : "Play"}
            </button>
            <button type="button" onClick={() => void reader.handlePauseResume()} disabled={Boolean(reader.unavailableReason) || reader.playbackState === "idle"} className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-canvas)] disabled:cursor-not-allowed disabled:bg-[var(--color-canvas)] disabled:text-[var(--color-text-muted)]">
              <Pause size={16} /> {reader.playbackState === "paused" ? (reader.isVietnamese ? "Tiếp tục" : "Resume") : (reader.isVietnamese ? "Tạm dừng" : "Pause")}
            </button>
            <button type="button" onClick={() => reader.stopPlayback()} disabled={reader.playbackState === "idle"} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-canvas)] disabled:cursor-not-allowed disabled:bg-[var(--color-canvas)] disabled:text-[var(--color-text-muted)]">
              <Square size={14} /> {reader.isVietnamese ? "Dừng" : "Stop"}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl bg-[var(--color-canvas)] px-4 py-3">
          <p className="text-sm text-[var(--color-text-secondary)]">{reader.helperText}</p>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
            {reader.isVietnamese ? "Chỉ chương đã chọn" : "Selected chapter only"}
          </p>
        </div>
      </div>
    </section>
  );
}

export function PublicVoiceReader(props: PublicVoiceReaderProps) {
  const reader = useVoiceReader(props);

  return (
    <>
      {reader.isPanelOpen && <button type="button" aria-label={reader.isVietnamese ? "Đóng trình đọc giọng nói" : "Close voice reader"} onClick={() => reader.setIsPanelOpen(false)} className="fixed inset-0 z-40 bg-[var(--color-text)]/20 sm:hidden" />}
      {reader.isPanelOpen && <PublicVoiceReaderPanel reader={reader} />}
      <div className="fixed bottom-4 right-4 z-50">
        <button type="button" onClick={() => reader.setIsPanelOpen((v) => !v)} aria-expanded={reader.isPanelOpen} className={cn("group inline-flex items-center gap-3 rounded-[24px] border px-4 py-3 shadow-lg backdrop-blur transition-all", reader.playbackState === "playing" ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]" : reader.playbackState === "paused" ? "border-amber-200 bg-amber-50/95 text-amber-900" : "border-[var(--color-border)] bg-[var(--color-surface)]/95 text-[var(--color-text)] hover:bg-[var(--color-surface)]")}>
          <span className={cn("flex h-10 w-10 items-center justify-center rounded-2xl", reader.playbackState === "playing" ? "bg-[var(--color-success)]/10 text-[var(--color-success)]" : reader.playbackState === "paused" ? "bg-amber-100 text-amber-700" : "bg-[var(--color-accent-muted)] text-[var(--color-accent)]")}>
            <Volume2 size={18} />
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">Voice Reader</span>
            <span className="block text-sm font-semibold">{reader.playbackState === "playing" ? `Reading ${reader.currentSegmentNumber}/${reader.speechSegments.length}` : reader.playbackState === "paused" ? `Paused ${reader.currentSegmentNumber}/${reader.speechSegments.length}` : "Open controls"}</span>
          </span>
          <ChevronUp size={18} className={cn("text-[var(--color-text-muted)] transition-transform", reader.isPanelOpen && "rotate-180")} />
        </button>
      </div>
    </>
  );
}
