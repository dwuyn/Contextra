"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronUp, Loader2, Pause, Play, Square, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildSpeechSegments,
  detectChapterLanguage,
  getReaderLanguageLabel,
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

type PrefetchedSegment = {
  index: number;
  objectUrl: string;
};

const EMPTY_VOICE_OPTIONS: Record<ReaderLanguage, VoiceOption[]> = {
  "en-US": [],
  "vi-VN": [],
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function getPlaybackErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Voice playback failed. Please try again.";
}

export function PublicVoiceReader({
  projectId,
  chapterId,
  chapterTitle,
  chapterContent,
  isLoading,
}: PublicVoiceReaderProps) {
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
  const activeFetchAbortRef = useRef<AbortController | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);
  const prefetchedSegmentRef = useRef<PrefetchedSegment | null>(null);

  const speechSegments = buildSpeechSegments(chapterTitle, chapterContent);
  const detectedLanguage = detectChapterLanguage(speechSegments.join(" "));
  const activeLanguage: ReaderLanguage =
    readerLanguageMode === "auto" ? detectedLanguage : readerLanguageMode;
  const availableVoices = voicesByLanguage[activeLanguage] ?? [];
  const preferredVoiceId = activeLanguage === "vi-VN" ? readerVoiceVi : readerVoiceEn;
  const activeVoice = availableVoices.find((voice) => voice.id === preferredVoiceId) ?? availableVoices[0] ?? null;
  const helperStatusLabel =
    playbackState === "paused" ? "Paused" : playbackState === "playing" ? "Reading" : "Ready";

  const unavailableReason =
    isLoading
      ? "Loading the current chapter before playback can start."
      : speechSegments.length === 0
        ? "This chapter does not have readable body content yet."
        : isLoadingVoices
          ? "Loading curated Google Cloud voices..."
          : voiceLoadError
            ? voiceLoadError
            : !activeVoice
              ? `No curated ${getReaderLanguageLabel(activeLanguage)} Google voice is configured.`
              : null;

  const helperText =
    runtimeError ??
    unavailableReason ??
    (playbackState === "paused"
      ? `Paused at section ${currentSegmentNumber} of ${speechSegments.length}.`
      : playbackState === "playing"
        ? `Reading section ${currentSegmentNumber} of ${speechSegments.length}.`
        : `Ready to read ${speechSegments.length} section${speechSegments.length === 1 ? "" : "s"} from this chapter.`);

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

      const blob = await response.blob();
      return URL.createObjectURL(blob);
    },
    [activeLanguage, activeVoice, chapterId, projectId, readerRate]
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
        .then((objectUrl) => {
          if (playbackSessionIdRef.current !== sessionId) {
            revokeObjectUrl(objectUrl);
            return;
          }

          clearPrefetchedSegment();
          prefetchedSegmentRef.current = { index: segmentIndex, objectUrl };
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
        let nextObjectUrl: string;
        if (prefetchedSegmentRef.current?.index === segmentIndex) {
          nextObjectUrl = prefetchedSegmentRef.current.objectUrl;
          prefetchedSegmentRef.current = null;
        } else {
          activeFetchAbortRef.current?.abort();
          const controller = new AbortController();
          activeFetchAbortRef.current = controller;
          nextObjectUrl = await requestSegmentAudio(segmentIndex, controller.signal);

          if (playbackSessionIdRef.current !== sessionId) {
            revokeObjectUrl(nextObjectUrl);
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
        currentAudioUrlRef.current = nextObjectUrl;
        audio.src = nextObjectUrl;
        audio.currentTime = 0;
        await audio.play();
        updatePlaybackState("playing");

        prefetchSegment(sessionId, segmentIndex + 1);
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        stopPlayback(getPlaybackErrorMessage(error));
      }
    },
    [
      activeVoice,
      clearCurrentAudioSource,
      prefetchSegment,
      requestSegmentAudio,
      revokeObjectUrl,
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

      stopPlayback("Voice playback failed. Please try again.");
    };

    return () => {
      audio.onended = null;
      audio.onerror = null;
    };
  }, [playSegment, speechSegments.length, stopPlayback]);

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
          setVoiceLoadError(getPlaybackErrorMessage(error));
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingVoices(false);
        }
      }
    };

    void loadVoices();
    return () => controller.abort();
  }, [projectId]);

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
        stopPlayback(getPlaybackErrorMessage(error));
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
          aria-label="Close voice reader"
          onClick={() => setIsPanelOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/20 sm:hidden"
        />
      )}

      {isPanelOpen && (
        <section
          className={cn(
            "fixed z-50 border border-slate-200 bg-white shadow-2xl",
            "inset-x-3 bottom-20 rounded-[30px] p-4",
            "sm:bottom-24 sm:right-4 sm:left-auto sm:w-[26rem] sm:rounded-[28px] sm:p-5"
          )}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-slate-900">
                  <Volume2 size={18} className="text-indigo-600" />
                  <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
                    Voice Reader
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Google Cloud speech for the selected chapter only.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsPanelOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
                aria-label="Close voice reader panel"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]",
                  playbackState === "playing"
                    ? "bg-emerald-100 text-emerald-700"
                    : playbackState === "paused"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                )}
              >
                {helperStatusLabel}
              </span>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-700">
                {readerLanguageMode === "auto"
                  ? `Auto ${getReaderLanguageLabel(detectedLanguage)}`
                  : getReaderLanguageLabel(activeLanguage)}
              </span>
              {isLoadingVoices && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                  <Loader2 size={12} className="animate-spin" />
                  Syncing
                </span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Language
                </span>
                <select
                  value={readerLanguageMode}
                  onChange={(event) => setReaderLanguageMode(event.target.value as ReaderLanguageMode)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-slate-900"
                >
                  <option value="auto">Auto detect</option>
                  <option value="en-US">English</option>
                  <option value="vi-VN">Vietnamese</option>
                </select>
              </label>

              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Voice
                </span>
                <select
                  value={activeVoice?.id ?? ""}
                  onChange={(event) => setReaderVoice(activeLanguage, event.target.value)}
                  disabled={availableVoices.length === 0}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-slate-900 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                >
                  {availableVoices.length === 0 ? (
                    <option value="">No curated voice</option>
                  ) : (
                    availableVoices.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.label}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Speed
                </span>
                <select
                  value={String(readerRate)}
                  onChange={(event) => setReaderRate(Number(event.target.value))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-slate-900"
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
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                >
                  <Play size={16} />
                  Play
                </button>
                <button
                  type="button"
                  onClick={() => void handlePauseResume()}
                  disabled={Boolean(unavailableReason) || playbackState === "idle"}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <Pause size={16} />
                  {playbackState === "paused" ? "Resume" : "Pause"}
                </button>
                <button
                  type="button"
                  onClick={() => stopPlayback()}
                  disabled={playbackState === "idle"}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <Square size={14} />
                  Stop
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-600">{helperText}</p>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Selected chapter only
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
              ? "border-emerald-200 bg-emerald-50/95 text-emerald-900"
              : playbackState === "paused"
                ? "border-amber-200 bg-amber-50/95 text-amber-900"
                : "border-slate-200 bg-white/95 text-slate-900 hover:bg-white"
          )}
        >
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-2xl",
              playbackState === "playing"
                ? "bg-emerald-100 text-emerald-700"
                : playbackState === "paused"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-indigo-50 text-indigo-600"
            )}
          >
            <Volume2 size={18} />
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
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
            className={cn("text-slate-400 transition-transform", isPanelOpen && "rotate-180")}
          />
        </button>
      </div>
    </>
  );
}
