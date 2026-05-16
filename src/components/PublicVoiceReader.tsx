"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Square, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  usePreferencesStore,
  type ReaderLanguage,
  type ReaderLanguageMode,
} from "@/store/usePreferencesStore";

const VIETNAMESE_CHARACTER_PATTERN =
  /[ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/;
const SPEECH_RATE_OPTIONS = [0.8, 1, 1.15, 1.3, 1.5];
const MAX_UTTERANCE_LENGTH = 260;
const LOW_QUALITY_VOICE_PATTERN = /\b(espeak|festival|compact)\b/i;
const HIGH_QUALITY_VOICE_PATTERN = /\b(natural|neural|enhanced|premium|online)\b/i;
const BRAND_VOICE_PATTERN = /\b(google|microsoft)\b/i;

type PlaybackState = "idle" | "playing" | "paused";

type PublicVoiceReaderProps = {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterContent: string;
  isLoading: boolean;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function getLanguageLabel(language: ReaderLanguage) {
  return language === "vi-VN" ? "Vietnamese" : "English";
}

function detectChapterLanguage(text: string): ReaderLanguage {
  return VIETNAMESE_CHARACTER_PATTERN.test(text) ? "vi-VN" : "en-US";
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

  const regexSegments = normalized.match(/[^.!?…]+(?:[.!?…]+|$)/g);
  if (!regexSegments) {
    return [normalized];
  }

  return regexSegments.map((segment) => normalizeWhitespace(segment)).filter(Boolean);
}

function toSpeechSegments(text: string) {
  return segmentSentences(text).flatMap((sentence) => splitLongSentence(sentence));
}

function extractSpeechBlocks(html: string) {
  const normalizedHtml = html.trim();
  if (!normalizedHtml) return [];

  if (typeof DOMParser === "undefined") {
    const fallbackText = normalizeWhitespace(
      normalizedHtml
        .replace(/<\/(h[1-6]|p|li|blockquote|pre|div|section|article)>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    );
    return fallbackText ? [fallbackText] : [];
  }

  const parsedDocument = new DOMParser().parseFromString(normalizedHtml, "text/html");
  const nodes = Array.from(
    parsedDocument.body.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, blockquote, pre")
  );
  const blocks = nodes
    .map((node) => normalizeWhitespace(node.textContent ?? ""))
    .filter(Boolean);

  if (blocks.length > 0) {
    return blocks;
  }

  const fallback = normalizeWhitespace(parsedDocument.body.textContent ?? "");
  return fallback ? [fallback] : [];
}

function buildSpeechSegments(chapterTitle: string, chapterContent: string) {
  const bodyBlocks = extractSpeechBlocks(chapterContent);
  if (bodyBlocks.length === 0) {
    return [];
  }

  const titleSegments = toSpeechSegments(chapterTitle);
  const bodySegments = bodyBlocks.flatMap((block) => toSpeechSegments(block));
  return [...titleSegments, ...bodySegments];
}

function getVoiceScore(voice: SpeechSynthesisVoice, language: ReaderLanguage) {
  const lang = voice.lang.toLowerCase();
  const exactLocale = language.toLowerCase();
  const languagePrefix = exactLocale.split("-")[0];
  const voiceName = voice.name.toLowerCase();

  let score = 0;

  if (lang === exactLocale) {
    score += 120;
  } else if (lang.startsWith(languagePrefix)) {
    score += 80;
  }

  if (HIGH_QUALITY_VOICE_PATTERN.test(voiceName)) {
    score += 35;
  }

  if (BRAND_VOICE_PATTERN.test(voiceName)) {
    score += 18;
  }

  if (voice.default) {
    score += 12;
  }

  if (!voice.localService) {
    score += 8;
  }

  if (LOW_QUALITY_VOICE_PATTERN.test(voiceName)) {
    score -= 45;
  }

  return score;
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

  const [isSpeechSupported, setIsSpeechSupported] = useState<boolean | null>(() => {
    if (typeof window === "undefined") return null;
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      !("SpeechSynthesisUtterance" in window)
    ) {
      return [];
    }

    return window.speechSynthesis.getVoices();
  });
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const playbackSessionIdRef = useRef(0);
  const playbackStateRef = useRef<PlaybackState>("idle");
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const currentSegmentIndexRef = useRef(0);
  const currentSegmentCharIndexRef = useRef(0);

  const speechSegments = buildSpeechSegments(chapterTitle, chapterContent);
  const detectedLanguage = detectChapterLanguage(speechSegments.join(" "));
  const activeLanguage: ReaderLanguage =
    readerLanguageMode === "auto" ? detectedLanguage : readerLanguageMode;
  const matchingVoices = voices.filter((voice) =>
    voice.lang.toLowerCase().startsWith(activeLanguage === "vi-VN" ? "vi" : "en")
  );
  const rankedVoices = [...matchingVoices].sort((left, right) => {
    return getVoiceScore(right, activeLanguage) - getVoiceScore(left, activeLanguage);
  });
  const preferredVoiceURI = activeLanguage === "vi-VN" ? readerVoiceVi : readerVoiceEn;
  const savedVoice = matchingVoices.find((voice) => voice.voiceURI === preferredVoiceURI) ?? null;
  const activeVoice = savedVoice ?? rankedVoices[0] ?? null;

  const unavailableReason =
    isSpeechSupported === null
      ? "Checking browser voice support..."
      : !isSpeechSupported
        ? "Voice playback is not supported in this browser."
        : isLoading
          ? "Loading the current chapter before playback can start."
          : speechSegments.length === 0
            ? "This chapter does not have readable body content yet."
            : !activeVoice
              ? `No ${getLanguageLabel(activeLanguage)} voice is available on this device/browser.`
              : null;

  const statusLabel =
    playbackState === "paused" ? "Paused" : playbackState === "playing" ? "Reading" : "Ready";
  const helperText = runtimeError ?? unavailableReason;

  const updatePlaybackState = useCallback((nextState: PlaybackState) => {
    playbackStateRef.current = nextState;
    setPlaybackState(nextState);
  }, []);

  const resetPlaybackProgress = useCallback(() => {
    activeUtteranceRef.current = null;
    currentSegmentIndexRef.current = 0;
    currentSegmentCharIndexRef.current = 0;
  }, []);

  const cancelSpeech = useCallback((nextError: string | null = null) => {
    playbackSessionIdRef.current += 1;
    resetPlaybackProgress();

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    updatePlaybackState("idle");
    setRuntimeError(nextError);
  }, [resetPlaybackProgress, updatePlaybackState]);

  const speakSegment = useCallback(
    function speakSegment(sessionId: number, segmentIndex: number, charIndex: number) {
      if (
        typeof window === "undefined" ||
        !("speechSynthesis" in window) ||
        !("SpeechSynthesisUtterance" in window) ||
        !activeVoice
      ) {
        cancelSpeech("Voice playback is not supported in this browser.");
        return;
      }

      const segment = speechSegments[segmentIndex];
      if (!segment) {
        resetPlaybackProgress();
        updatePlaybackState("idle");
        return;
      }

      const clampedCharIndex = Math.max(0, Math.min(charIndex, segment.length));
      const remainingSegment = segment.slice(clampedCharIndex);

      if (!remainingSegment.trim()) {
        speakSegment(sessionId, segmentIndex + 1, 0);
        return;
      }

      currentSegmentIndexRef.current = segmentIndex;
      currentSegmentCharIndexRef.current = clampedCharIndex;

      const utterance = new SpeechSynthesisUtterance(remainingSegment);
      utterance.lang = activeLanguage;
      utterance.rate = readerRate;
      utterance.voice = activeVoice;
      activeUtteranceRef.current = utterance;

      utterance.onstart = () => {
        if (playbackSessionIdRef.current !== sessionId) return;
        updatePlaybackState("playing");
      };

      utterance.onboundary = (event) => {
        if (playbackSessionIdRef.current !== sessionId) return;
        currentSegmentIndexRef.current = segmentIndex;
        currentSegmentCharIndexRef.current = Math.min(
          segment.length,
          clampedCharIndex + event.charIndex
        );
      };

      utterance.onend = () => {
        if (playbackSessionIdRef.current !== sessionId) return;

        activeUtteranceRef.current = null;
        const nextSegmentIndex = segmentIndex + 1;
        currentSegmentIndexRef.current = nextSegmentIndex;
        currentSegmentCharIndexRef.current = 0;

        if (nextSegmentIndex >= speechSegments.length) {
          resetPlaybackProgress();
          updatePlaybackState("idle");
          return;
        }

        speakSegment(sessionId, nextSegmentIndex, 0);
      };

      utterance.onerror = (event) => {
        if (playbackSessionIdRef.current !== sessionId) return;
        if (event.error === "canceled" || event.error === "interrupted") {
          return;
        }

        cancelSpeech("Voice playback failed in this browser. Try a different voice.");
      };

      window.speechSynthesis.speak(utterance);
    },
    [
      activeLanguage,
      activeVoice,
      cancelSpeech,
      readerRate,
      resetPlaybackProgress,
      speechSegments,
      updatePlaybackState,
    ]
  );

  const startPlayback = useCallback(
    (segmentIndex: number, charIndex: number) => {
      if (
        unavailableReason ||
        typeof window === "undefined" ||
        !("speechSynthesis" in window) ||
        !activeVoice ||
        speechSegments.length === 0
      ) {
        return;
      }

      const sessionId = playbackSessionIdRef.current + 1;
      playbackSessionIdRef.current = sessionId;
      currentSegmentIndexRef.current = segmentIndex;
      currentSegmentCharIndexRef.current = charIndex;
      activeUtteranceRef.current = null;
      setRuntimeError(null);
      updatePlaybackState("playing");
      window.speechSynthesis.cancel();
      speakSegment(sessionId, segmentIndex, charIndex);
    },
    [activeVoice, speakSegment, speechSegments.length, unavailableReason, updatePlaybackState]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      return;
    }

    const syncVoices = () => {
      setIsSpeechSupported(true);
      setVoices(window.speechSynthesis.getVoices());
    };

    syncVoices();
    window.speechSynthesis.addEventListener("voiceschanged", syncVoices);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", syncVoices);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    cancelSpeech();
  }, [projectId, chapterId, chapterTitle, chapterContent, cancelSpeech]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    cancelSpeech();
  }, [readerLanguageMode, readerRate, readerVoiceEn, readerVoiceVi, cancelSpeech]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePageHide = () => {
      playbackSessionIdRef.current += 1;
      resetPlaybackProgress();
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      updatePlaybackState("idle");
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [resetPlaybackProgress, updatePlaybackState]);

  const handlePlay = () => {
    if (unavailableReason || speechSegments.length === 0) {
      return;
    }

    resetPlaybackProgress();
    startPlayback(0, 0);
  };

  const handlePauseResume = () => {
    if (unavailableReason || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    if (playbackStateRef.current === "paused") {
      startPlayback(currentSegmentIndexRef.current, currentSegmentCharIndexRef.current);
      return;
    }

    if (playbackStateRef.current !== "playing" || !activeUtteranceRef.current) {
      return;
    }

    playbackSessionIdRef.current += 1;
    activeUtteranceRef.current = null;
    window.speechSynthesis.cancel();
    updatePlaybackState("paused");
    setRuntimeError(null);
  };

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-slate-900">
              <Volume2 size={18} className="text-indigo-600" />
              <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
                Voice Reader
              </h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Reads the selected chapter in English or Vietnamese.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start">
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
              {statusLabel}
            </span>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-700">
              {readerLanguageMode === "auto"
                ? `Auto ${getLanguageLabel(detectedLanguage)}`
                : getLanguageLabel(activeLanguage)}
            </span>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Language
            </span>
            <select
              value={readerLanguageMode}
              onChange={(event) => {
                cancelSpeech();
                setReaderLanguageMode(event.target.value as ReaderLanguageMode);
              }}
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
              value={activeVoice?.voiceURI ?? ""}
              onChange={(event) => {
                cancelSpeech();
                setReaderVoice(activeLanguage, event.target.value);
              }}
              disabled={rankedVoices.length === 0}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-slate-900 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            >
              {rankedVoices.length === 0 ? (
                <option value="">No matching voice</option>
              ) : (
                rankedVoices.map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang})
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
              onChange={(event) => {
                cancelSpeech();
                setReaderRate(Number(event.target.value));
              }}
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
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              <Play size={16} />
              Play
            </button>
            <button
              type="button"
              onClick={handlePauseResume}
              disabled={Boolean(unavailableReason) || playbackState === "idle"}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            >
              <Pause size={16} />
              {playbackState === "paused" ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={() => cancelSpeech()}
              disabled={playbackState === "idle"}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            >
              <Square size={14} />
              Stop
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            {helperText ??
              `Ready to read ${speechSegments.length} section${speechSegments.length === 1 ? "" : "s"} from this chapter.`}
          </p>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Selected chapter only
          </p>
        </div>
      </div>
    </section>
  );
}
