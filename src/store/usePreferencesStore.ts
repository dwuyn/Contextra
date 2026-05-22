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
import type { ReaderLanguage, ReaderLanguageMode } from "@/lib/voiceReader";

export type { FontType, ThemeType };
export type { ReaderLanguage, ReaderLanguageMode };
const PREFERENCES_STORE_VERSION = 5;

interface PreferencesState {
  theme: ThemeType;
  font: FontType;
  readerLanguageMode: ReaderLanguageMode;
  readerRate: number;
  readerVoiceEn: string;
  readerVoiceVi: string;
  setTheme: (theme: ThemeType) => void;
  setFont: (font: FontType) => void;
  setReaderLanguageMode: (mode: ReaderLanguageMode) => void;
  setReaderRate: (rate: number) => void;
  setReaderVoice: (language: ReaderLanguage, voiceURI: string) => void;
}

type PersistedPreferencesState = {
  theme?: unknown;
  font?: unknown;
  readerLanguageMode?: ReaderLanguageMode;
  readerRate?: number;
  readerVoiceEn?: string;
  readerVoiceVi?: string;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: DEFAULT_THEME,
      font: DEFAULT_FONT,
      readerLanguageMode: "auto",
      readerRate: 1,
      readerVoiceEn: "",
      readerVoiceVi: "",
      setTheme: (theme) => set({ theme }),
      setFont: (font) => set({ font }),
      setReaderLanguageMode: (readerLanguageMode) => set({ readerLanguageMode }),
      setReaderRate: (readerRate) => set({ readerRate }),
      setReaderVoice: (language, voiceURI) =>
        set(language === "vi-VN" ? { readerVoiceVi: voiceURI } : { readerVoiceEn: voiceURI }),
    }),
    {
      name: "contextra-preferences",
      version: PREFERENCES_STORE_VERSION,
      migrate: (persistedState: unknown, version) => {
        const state =
          persistedState && typeof persistedState === "object"
            ? { ...(persistedState as PersistedPreferencesState) }
            : {};

        if (version < 3) {
          state.readerVoiceEn = "";
          state.readerVoiceVi = "";
        }

        return {
          ...state,
          theme: normalizeTheme(state.theme),
          font: normalizeFont(state.font),
        };
      },
    }
  )
);
