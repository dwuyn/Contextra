import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_FONT,
  DEFAULT_THEME,
  normalizeFont,
  normalizeTheme,
  type FontType,
  type ThemeType,
} from "@/lib/appearance";
import type { ReaderLanguage } from "@/lib/voiceReader";

export type { FontType, ThemeType };
export type { ReaderLanguage };
const PREFERENCES_STORE_VERSION = 7;

interface PreferencesState {
  theme: ThemeType;
  font: FontType;
  readerLanguage: ReaderLanguage;
  readerRate: number;
  readerVoiceEn: string;
  readerVoiceVi: string;
  setTheme: (theme: ThemeType) => void;
  setFont: (font: FontType) => void;
  setReaderLanguage: (language: ReaderLanguage) => void;
  setReaderRate: (rate: number) => void;
  setReaderVoice: (language: ReaderLanguage, voiceURI: string) => void;
}

export type PersistedPreferencesState = {
  theme?: unknown;
  font?: unknown;
  readerLanguage?: string;
  readerRate?: number;
  readerVoiceEn?: string;
  readerVoiceVi?: string;
};

function isReaderLanguage(value: string): value is ReaderLanguage {
  return value === "en-US" || value === "vi-VN";
}

export function migratePreferencesStore(persistedState: unknown, version: number) {
  const state =
    persistedState && typeof persistedState === "object"
      ? { ...(persistedState as PersistedPreferencesState) }
      : {};

  if (version < 3) {
    state.readerVoiceEn = "";
    state.readerVoiceVi = "";
  }

  if (version < 6) {
    const raw = "readerLanguage" in state ? state.readerLanguage : (state as Record<string, unknown>).readerLanguageMode;
    const value = typeof raw === "string" ? raw : "auto";
    state.readerLanguage = isReaderLanguage(value) ? value : "en-US";
    // biome-ignore lint/performance/noDelete: migration cleanup
    delete (state as Record<string, unknown>).readerLanguageMode;
  }

  if (version < 7) {
    const legacyAliases = ["despina", "orus", "vindemiatrix", "charon"];
    if (state.readerVoiceEn && legacyAliases.includes(state.readerVoiceEn.toLowerCase())) {
      state.readerVoiceEn = "";
    }
    if (state.readerVoiceVi && legacyAliases.includes(state.readerVoiceVi.toLowerCase())) {
      state.readerVoiceVi = "";
    }
  }

  return {
    ...state,
    theme: normalizeTheme(state.theme),
    font: normalizeFont(state.font),
  };
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: DEFAULT_THEME,
      font: DEFAULT_FONT,
      readerLanguage: "en-US",
      readerRate: 1,
      readerVoiceEn: "",
      readerVoiceVi: "",
      setTheme: (theme) => set({ theme }),
      setFont: (font) => set({ font }),
      setReaderLanguage: (readerLanguage) => set({ readerLanguage }),
      setReaderRate: (readerRate) => set({ readerRate }),
      setReaderVoice: (language, voiceURI) =>
        set(language === "vi-VN" ? { readerVoiceVi: voiceURI } : { readerVoiceEn: voiceURI }),
    }),
    {
      name: "contextra-preferences",
      version: PREFERENCES_STORE_VERSION,
      migrate: migratePreferencesStore,
    }
  )
);
