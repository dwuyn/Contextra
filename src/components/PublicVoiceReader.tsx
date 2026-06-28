"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronUp, Loader2, Pause, Play, Square, Volume2, X } from "lucide-react";
import { useLocale } from "next-intl";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import {
  buildSpeechSegments,
  getLocaleDefaultReaderLanguage,
  type ReaderLanguage,
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
import { fetchChapterContent } from "@/lib/chapterContentClient";
import { usePreferencesStore } from "@/store/usePreferencesStore";

type PlaybackState = "idle" | "playing" | "paused";

type BranchChapterMeta = {
  id: string;
  title: string;
};

type PublicVoiceReaderProps = {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterContent: string;
  orderedBranchChapters: BranchChapterMeta[];
  isLoading?: boolean;
};

type VoiceResponse = {
  voices?: VoiceOption[];
};

type PrefetchedSegment = SegmentAudioSource;

type PlaylistEntry = {
  chapterId: string;
  chapterTitle: string;
  content: string;
  speechSegments: string[];
  skipped: boolean;
};

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

async function fetchContentForChapter(
  projectId: string,
  chapterId: string,
  chapterTitle: string,
): Promise<{ content: string; title: string }> {
  const payload = await fetchChapterContent(projectId, chapterId);
  return { content: payload.content, title: payload.title || chapterTitle };
}

function useVoiceReader(props: PublicVoiceReaderProps) {
  const { projectId, chapterId, chapterTitle, chapterContent, orderedBranchChapters, isLoading } = props;
  const isVietnamese = useLocale() === "vi";
  const readerLanguage = usePreferencesStore((state) => state.readerLanguage);
  const readerRate = usePreferencesStore((state) => state.readerRate);
  const readerVoiceEn = usePreferencesStore((state) => state.readerVoiceEn);
  const readerVoiceVi = usePreferencesStore((state) => state.readerVoiceVi);
  const setReaderLanguage = usePreferencesStore((state) => state.setReaderLanguage);
  const setReaderRate = usePreferencesStore((state) => state.setReaderRate);
  const setReaderVoice = usePreferencesStore((state) => state.setReaderVoice);

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [currentChapterOffset, setCurrentChapterOffset] = useState(0);
  const [currentSegmentNumber, setCurrentSegmentNumber] = useState(0);
  const [chaptersToRead, setChaptersToRead] = useState(1);
  const [playlistEntries, setPlaylistEntries] = useState<PlaylistEntry[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackStateRef = useRef<PlaybackState>("idle");
  const playbackSessionIdRef = useRef(0);
  const currentSegmentIndexRef = useRef(0);
  const currentChapterOffsetRef = useRef(0);
  const currentAudioUrlRef = useRef<string | null>(null);
  const currentAudioSourceRef = useRef<ActiveAudioSource | null>(null);
  const activeFetchAbortRef = useRef<AbortController | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);
  const prefetchedSegmentRef = useRef<PrefetchedSegment | null>(null);
  const prefetchedChapterIdRef = useRef<string | null>(null);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      if (readerLanguage === "en-US" && isVietnamese) {
        setReaderLanguage("vi-VN");
      }
    }
  });

  // Derive chapter index and compute max readable chapters
  const currentChapterIndexInBranch = useMemo(() => {
    return orderedBranchChapters.findIndex((ch) => ch.id === chapterId);
  }, [orderedBranchChapters, chapterId]);

  const remainingChapters = useMemo(() => {
    if (currentChapterIndexInBranch < 0) return 1;
    return orderedBranchChapters.length - currentChapterIndexInBranch;
  }, [currentChapterIndexInBranch, orderedBranchChapters.length]);

  // Clamp chaptersToRead when current chapter changes or branch shrinks
  const safeChaptersToRead = Math.max(1, Math.min(chaptersToRead, remainingChapters));
  if (safeChaptersToRead !== chaptersToRead) {
    setChaptersToRead(safeChaptersToRead);
  }

  // Build playlist metadata (chapter ids from current position forward)
  const playlistChapterMetas = useMemo(() => {
    if (currentChapterIndexInBranch < 0) return [{ id: chapterId, title: chapterTitle }];
    return orderedBranchChapters
      .slice(currentChapterIndexInBranch, currentChapterIndexInBranch + safeChaptersToRead)
      .map((ch) => ({ id: ch.id, title: ch.title }));
  }, [currentChapterIndexInBranch, orderedBranchChapters, safeChaptersToRead, chapterId, chapterTitle]);

  const languageLabel = (language: ReaderLanguage) =>
    language === "vi-VN" ? (isVietnamese ? "Tiếng Việt" : "Vietnamese") : (isVietnamese ? "Tiếng Anh" : "English");

  const playbackErrorFallback = isVietnamese
    ? "Không thể phát giọng đọc. Vui lòng thử lại."
    : "Voice playback failed. Please try again.";

  const {
    data: voicesByLanguage = EMPTY_VOICE_OPTIONS,
    error: voiceLoadFailure,
    isLoading: isLoadingVoices,
  } = useSWR<Record<ReaderLanguage, VoiceOption[]>, Error>(
    projectId ? ["voice-reader-voices", projectId] : null,
    ([, currentProjectId]: readonly [string, string]) => loadVoiceOptions(currentProjectId),
    {
      revalidateOnFocus: false,
    }
  );

  const voiceLoadError = voiceLoadFailure
    ? getPlaybackErrorMessage(voiceLoadFailure, playbackErrorFallback)
    : null;

  const activeLanguage: ReaderLanguage = readerLanguage;
  const availableVoices = voicesByLanguage[activeLanguage] ?? [];
  const preferredVoiceId = activeLanguage === "vi-VN" ? readerVoiceVi : readerVoiceEn;
  const activeVoice = availableVoices.find((voice) => voice.id === preferredVoiceId) ?? availableVoices[0] ?? null;

  // Check if we're in the middle of the playlist (not first chapter)
  const isAdvancingChapter = currentChapterOffset > 0;

  const unavailableReason = isLoading
    ? isVietnamese
      ? "Đang tải chương hiện tại trước khi có thể bắt đầu phát."
      : "Loading the current chapter before playback can start."
    : isLoadingVoices
      ? isVietnamese
        ? "Đang tải các giọng đọc Google Cloud đã tuyển chọn..."
        : "Loading curated Google Cloud voices..."
      : voiceLoadError
        ? voiceLoadError
        : !activeVoice
          ? isVietnamese
            ? `Chưa cấu hình giọng đọc Google ${languageLabel(activeLanguage)} đã tuyển chọn.`
            : `No curated ${languageLabel(activeLanguage)} Google voice is configured.`
          : null;

  // Total progress across all playlist chapters
  const totalSegmentCount = playlistEntries.reduce((sum, e) => sum + e.speechSegments.length, 0);
  const cumulativeSegmentsBeforeCurrent = playlistEntries
    .slice(0, currentChapterOffset)
    .reduce((sum, e) => sum + e.speechSegments.length, 0);
  const absoluteSegmentNumber = cumulativeSegmentsBeforeCurrent + currentSegmentNumber;

  // Chapter labels for progress display
  const totalChapters = safeChaptersToRead;
  const displayedChapter = currentChapterOffset + 1;

  const helperText =
    runtimeError ??
    unavailableReason ??
    (playbackState === "paused"
      ? isVietnamese
        ? `Đã tạm dừng — chương ${displayedChapter}/${totalChapters}, đoạn ${currentSegmentNumber}/${playlistEntries[currentChapterOffset]?.speechSegments.length ?? "?"}.`
        : `Paused — chapter ${displayedChapter}/${totalChapters}, section ${currentSegmentNumber}/${playlistEntries[currentChapterOffset]?.speechSegments.length ?? "?"}.`
      : playbackState === "playing"
        ? isVietnamese
          ? `Đang đọc — chương ${displayedChapter}/${totalChapters}, đoạn ${currentSegmentNumber}/${playlistEntries[currentChapterOffset]?.speechSegments.length ?? "?"}.`
          : `Reading — chapter ${displayedChapter}/${totalChapters}, section ${currentSegmentNumber}/${playlistEntries[currentChapterOffset]?.speechSegments.length ?? "?"}.`
        : totalChapters === 1
          ? isVietnamese
            ? "Sẵn sàng đọc 1 chương."
            : "Ready to read 1 chapter."
          : isVietnamese
            ? `Sẵn sàng đọc ${totalChapters} chương.`
            : `Ready to read ${totalChapters} chapters.`);

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
    prefetchedChapterIdRef.current = null;
  }, [revokeObjectUrl]);

  const clearPendingRequests = useCallback(() => {
    activeFetchAbortRef.current?.abort();
    activeFetchAbortRef.current = null;
    prefetchAbortRef.current?.abort();
    prefetchAbortRef.current = null;
  }, []);

  const resetPlaybackPosition = useCallback(() => {
    currentSegmentIndexRef.current = 0;
    currentChapterOffsetRef.current = 0;
    setCurrentSegmentNumber(0);
    setCurrentChapterOffset(0);
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
    [clearCurrentAudioSource, clearPendingRequests, clearPrefetchedSegment, resetPlaybackPosition, updatePlaybackState],
  );

  const requestSegmentAudio = useCallback(
    async (segmentIndex: number, chapterIdForSegment: string, signal?: AbortSignal) => {
      if (!activeVoice) throw new Error("No Google Cloud voice is available for this language.");

      const params = new URLSearchParams({
        projectId,
        chapterId: chapterIdForSegment,
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
    },
    [activeLanguage, activeVoice, isVietnamese, projectId, readerRate],
  );

  const prefetchSegment = useCallback(
    (sessionId: number, chapterIdx: number, segmentIdx: number) => {
      const entry = playlistEntries[chapterIdx];
      if (!entry || segmentIdx >= entry.speechSegments.length || !activeVoice) return;
      if (prefetchedSegmentRef.current?.index === segmentIdx) return;

      prefetchAbortRef.current?.abort();
      const controller = new AbortController();
      prefetchAbortRef.current = controller;

      void requestSegmentAudio(segmentIdx, entry.chapterId, controller.signal)
        .then((segmentSource) => {
          if (playbackSessionIdRef.current !== sessionId) {
            revokeObjectUrl(segmentSource.objectUrl);
            return;
          }
          clearPrefetchedSegment();
          prefetchedSegmentRef.current = segmentSource;
          prefetchedChapterIdRef.current = entry.chapterId;
        })
        .catch((error) => {
          if (!isAbortError(error)) console.error("Voice segment prefetch failed:", error);
        })
        .finally(() => {
          if (prefetchAbortRef.current === controller) prefetchAbortRef.current = null;
        });
    },
    [activeVoice, clearPrefetchedSegment, playlistEntries, requestSegmentAudio, revokeObjectUrl],
  );

  const playSegmentRef = useRef<((sessionId: number, chapterIdx: number, segmentIdx: number) => Promise<void>) | null>(null);

  const playSegment = useCallback(
    async (sessionId: number, chapterIdx: number, segmentIdx: number) => {
      const audio = audioRef.current;
      if (!audio || !activeVoice) {
        stopPlayback("Voice playback is not available in this browser.");
        return;
      }

      const entry = playlistEntries[chapterIdx];
      if (!entry) {
        stopPlayback();
        return;
      }

      if (segmentIdx >= entry.speechSegments.length) {
        // Clear prefetched segment (it belongs to the previous chapter)
        clearPrefetchedSegment();

        // Current chapter done, advance to next
        const nextChapter = chapterIdx + 1;
        if (nextChapter < playlistEntries.length) {
          // Skip chapters with no content
          let nextPlayable = nextChapter;
          while (
            nextPlayable < playlistEntries.length &&
            (playlistEntries[nextPlayable].skipped || playlistEntries[nextPlayable].speechSegments.length === 0)
          ) {
            nextPlayable += 1;
          }

          if (nextPlayable < playlistEntries.length) {
            currentChapterOffsetRef.current = nextPlayable;
            currentSegmentIndexRef.current = 0;
            setCurrentChapterOffset(nextPlayable);
            setCurrentSegmentNumber(0);
            void playSegmentRef.current?.(sessionId, nextPlayable, 0);
            return;
          }
        }
        stopPlayback();
        return;
      }

      try {
        let nextSegmentSource: SegmentAudioSource;
        if (
          prefetchedSegmentRef.current?.index === segmentIdx &&
          prefetchedChapterIdRef.current === entry.chapterId
        ) {
          nextSegmentSource = prefetchedSegmentRef.current;
          prefetchedSegmentRef.current = null;
        } else {
          activeFetchAbortRef.current?.abort();
          const controller = new AbortController();
          activeFetchAbortRef.current = controller;
          nextSegmentSource = await requestSegmentAudio(segmentIdx, entry.chapterId, controller.signal);

          if (playbackSessionIdRef.current !== sessionId) {
            revokeObjectUrl(nextSegmentSource.objectUrl);
            return;
          }

          if (activeFetchAbortRef.current === controller) activeFetchAbortRef.current = null;
        }

        currentSegmentIndexRef.current = segmentIdx;
        currentChapterOffsetRef.current = chapterIdx;
        setCurrentSegmentNumber(segmentIdx + 1);
        setCurrentChapterOffset(chapterIdx);
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

        // Prefetch next segment in same chapter
        prefetchSegment(sessionId, chapterIdx, segmentIdx + 1);
      } catch (error) {
        if (isAbortError(error)) return;
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
      playlistEntries,
      prefetchSegment,
      requestSegmentAudio,
      revokeObjectUrl,
      playbackErrorFallback,
      stopPlayback,
      updatePlaybackState,
      clearPrefetchedSegment,
    ],
  );
  useEffect(() => {
    playSegmentRef.current = playSegment;
  }, [playSegment]);

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
      const chapterIdx = currentChapterOffsetRef.current;
      const nextSegment = currentSegmentIndexRef.current + 1;
      void playSegment(playbackSessionIdRef.current, chapterIdx, nextSegment);
    };

    audio.onerror = () => {
      if (playbackStateRef.current === "idle") return;
      stopPlayback(buildUnsupportedMediaMessage(isVietnamese, currentAudioSourceRef.current));
    };

    return () => {
      audio.onended = null;
      audio.onerror = null;
    };
  }, [isVietnamese, playSegment, stopPlayback]);

  // Stop playback when any control param changes
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [chapterContent, chapterId, chapterTitle, projectId, safeChaptersToRead, stopPlayback]);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [readerLanguage, readerRate, readerVoiceEn, readerVoiceVi, stopPlayback]);

  const stringifiedChapters = JSON.stringify(orderedBranchChapters);
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stringifiedChapters, stopPlayback]);

  useEffect(() => {
    const handlePageHide = () => {
      stopPlayback();
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [stopPlayback]);

  const handlePlay = useCallback(async () => {
    if (unavailableReason) return;

    // Build playlist entries
    const sessionId = playbackSessionIdRef.current + 1;
    playbackSessionIdRef.current = sessionId;

    const entries: PlaylistEntry[] = [];
    for (let i = 0; i < playlistChapterMetas.length; i++) {
      const meta = playlistChapterMetas[i];

      if (i === 0 && meta.id === chapterId) {
        // Current chapter: use props
        const segments = buildSpeechSegments(chapterTitle, chapterContent);
        if (segments.length === 0) {
          entries.push({ chapterId: meta.id, chapterTitle: meta.title, content: chapterContent, speechSegments: [], skipped: true });
        } else {
          entries.push({ chapterId: meta.id, chapterTitle: meta.title, content: chapterContent, speechSegments: segments, skipped: false });
        }
      } else {
        // Other chapter: fetch on demand
        try {
          const fetched = await fetchContentForChapter(projectId, meta.id, meta.title);
          const segments = buildSpeechSegments(fetched.title, fetched.content);
          if (segments.length === 0) {
            entries.push({ chapterId: meta.id, chapterTitle: meta.title, content: fetched.content, speechSegments: [], skipped: true });
          } else {
            entries.push({ chapterId: meta.id, chapterTitle: meta.title, content: fetched.content, speechSegments: segments, skipped: false });
          }
        } catch {
          entries.push({ chapterId: meta.id, chapterTitle: meta.title, content: "", speechSegments: [], skipped: true });
        }
      }
    }

    setPlaylistEntries(entries);

    // Find first non-skipped chapter
    let firstPlayable = 0;
    while (firstPlayable < entries.length && (entries[firstPlayable].skipped || entries[firstPlayable].speechSegments.length === 0)) {
      firstPlayable += 1;
    }

    if (firstPlayable >= entries.length) {
      // All chapters are unreadable — don't start playback
      return;
    }

    resetPlaybackPosition();
    currentChapterOffsetRef.current = firstPlayable;

    void playSegment(sessionId, firstPlayable, 0);
  }, [
    unavailableReason,
    playlistChapterMetas,
    chapterId,
    chapterTitle,
    chapterContent,
    projectId,
    resetPlaybackPosition,
    playSegment,
  ]);

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
    readerLanguage,
    readerRate,
    setReaderLanguage,
    setReaderRate,
    setReaderVoice,
    isPanelOpen,
    setIsPanelOpen,
    isLoadingVoices,
    playbackState,
    currentSegmentNumber,
    currentChapterOffset,
    displayedChapter,
    totalChapters,
    playlistEntries,
    activeLanguage,
    availableVoices,
    activeVoice,
    languageLabel,
    unavailableReason,
    helperText,
    safeChaptersToRead,
    remainingChapters,
    setChaptersToRead,
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
        "sm:bottom-24 sm:right-4 sm:left-auto sm:w-[26rem] sm:rounded-[28px] sm:p-5",
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
          </div>
          <button
            type="button"
            onClick={() => reader.setIsPanelOpen(false)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-canvas)] hover:text-[var(--color-text)]"
            aria-label={reader.isVietnamese ? "Đóng bảng trình đọc giọng nói" : "Close voice reader panel"}
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
              {reader.isVietnamese ? "Ngôn ngữ" : "Language"}
            </span>
            <select
              value={reader.readerLanguage}
              onChange={(e) => reader.setReaderLanguage(e.target.value as ReaderLanguage)}
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-text)]"
            >
              <option value="en-US">{reader.isVietnamese ? "Tiếng Anh" : "English"}</option>
              <option value="vi-VN">{reader.isVietnamese ? "Tiếng Việt" : "Vietnamese"}</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
              {reader.isVietnamese ? "Giọng đọc" : "Voice"}
            </span>
            <select
              value={reader.activeVoice?.id ?? ""}
              onChange={(e) => reader.setReaderVoice(reader.activeLanguage, e.target.value)}
              disabled={reader.availableVoices.length === 0}
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-text)] disabled:cursor-not-allowed disabled:bg-[var(--color-canvas)] disabled:text-[var(--color-text-muted)]"
            >
              {reader.availableVoices.length === 0 ? (
                <option value="">
                  {reader.isVietnamese ? "Chưa có giọng đọc tuyển chọn" : "No curated voice"}
                </option>
              ) : (
                reader.availableVoices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {getVoiceDisplayLabel(voice, reader.isVietnamese)}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
              {reader.isVietnamese ? "Tốc độ" : "Speed"}
            </span>
            <select
              value={String(reader.readerRate)}
              onChange={(e) => reader.setReaderRate(Number(e.target.value))}
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-text)]"
            >
              {SPEECH_RATE_OPTIONS.map((rateOption) => (
                <option key={rateOption} value={String(rateOption)}>
                  {rateOption.toFixed(rateOption % 1 === 0 ? 0 : 2)}x
                </option>
              ))}
            </select>
          </label>
          {reader.remainingChapters > 1 && (
            <label className="flex min-w-0 flex-col gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                {reader.isVietnamese ? "Chương" : "Chapters"}
              </span>
              <input
                type="number"
                min={1}
                max={reader.remainingChapters}
                value={reader.safeChaptersToRead}
                onChange={(e) => {
                  const raw = Number.parseInt(e.target.value, 10);
                  if (Number.isNaN(raw)) return;
                  reader.setChaptersToRead(Math.max(1, Math.min(raw, reader.remainingChapters)));
                }}
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-text)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            onClick={reader.handlePlay}
            disabled={Boolean(reader.unavailableReason)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--color-text)] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--color-text)] disabled:cursor-not-allowed disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-secondary)]"
          >
            <Play size={16} /> {reader.isVietnamese ? "Phát" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => void reader.handlePauseResume()}
            disabled={Boolean(reader.unavailableReason) || reader.playbackState === "idle"}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-canvas)] disabled:cursor-not-allowed disabled:bg-[var(--color-canvas)] disabled:text-[var(--color-text-muted)]"
          >
            <Pause size={16} />{" "}
            {reader.playbackState === "paused"
              ? reader.isVietnamese
                ? "Tiếp tục"
                : "Resume"
              : reader.isVietnamese
                ? "Tạm dừng"
                : "Pause"}
          </button>
          <button
            type="button"
            onClick={() => reader.stopPlayback()}
            disabled={reader.playbackState === "idle"}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-canvas)] disabled:cursor-not-allowed disabled:bg-[var(--color-canvas)] disabled:text-[var(--color-text-muted)]"
          >
            <Square size={14} /> {reader.isVietnamese ? "Dừng" : "Stop"}
          </button>
        </div>

        <div className="rounded-2xl bg-[var(--color-canvas)] px-4 py-3">
          <p className="text-sm text-[var(--color-text-secondary)]">{reader.helperText}</p>
        </div>
      </div>
    </section>
  );
}

export function PublicVoiceReader(props: PublicVoiceReaderProps) {
  const reader = useVoiceReader(props);

  return (
    <>
      {reader.isPanelOpen && (
        <button
          type="button"
          aria-label={reader.isVietnamese ? "Đóng trình đọc giọng nói" : "Close voice reader"}
          onClick={() => reader.setIsPanelOpen(false)}
          className="fixed inset-0 z-40 bg-[var(--color-text)]/20 sm:hidden"
        />
      )}
      {reader.isPanelOpen && <PublicVoiceReaderPanel reader={reader} />}
      <div className="fixed bottom-4 right-4 z-50">
        <button
          type="button"
          onClick={() => reader.setIsPanelOpen((v) => !v)}
          aria-expanded={reader.isPanelOpen}
          className={cn(
            "group inline-flex items-center gap-3 rounded-[24px] border px-4 py-3 shadow-lg backdrop-blur transition-all",
            reader.playbackState === "playing"
              ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]"
              : reader.playbackState === "paused"
                ? "border-amber-200 bg-amber-50/95 text-amber-900"
                : "border-[var(--color-border)] bg-[var(--color-surface)]/95 text-[var(--color-text)] hover:bg-[var(--color-surface)]",
          )}
        >
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-2xl",
              reader.playbackState === "playing"
                ? "bg-[var(--color-success)]/10 text-[var(--color-success)]"
                : reader.playbackState === "paused"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-[var(--color-accent-muted)] text-[var(--color-accent)]",
            )}
          >
            <Volume2 size={18} />
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
              Voice Reader
            </span>
            <span className="block text-sm font-semibold">
              {reader.playbackState === "playing"
                ? reader.totalChapters > 1
                  ? `Ch ${reader.displayedChapter}/${reader.totalChapters}`
                  : `Sec ${reader.currentSegmentNumber}/${reader.playlistEntries[reader.currentChapterOffset]?.speechSegments.length ?? "?"}`
                : reader.playbackState === "paused"
                  ? reader.totalChapters > 1
                    ? `Paused ch ${reader.displayedChapter}/${reader.totalChapters}`
                    : `Paused ${reader.currentSegmentNumber}/${reader.playlistEntries[reader.currentChapterOffset]?.speechSegments.length ?? "?"}`
                  : "Open controls"}
            </span>
          </span>
          <ChevronUp
            size={18}
            className={cn("text-[var(--color-text-muted)] transition-transform", reader.isPanelOpen && "rotate-180")}
          />
        </button>
      </div>
    </>
  );
}
