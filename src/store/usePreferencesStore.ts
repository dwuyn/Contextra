import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeType = "notion" | "mist" | "forest" | "cream" | "graphite" | "rose" | "dark";
export type FontType = "notion-ui" | "manrope" | "literata" | "space-grotesk" | "georgia" | "verdana" | "trebuchet-ms" | "courier-new";
export type ReaderLanguage = "en-US" | "vi-VN";
export type ReaderLanguageMode = "auto" | ReaderLanguage;
const PREFERENCES_STORE_VERSION = 2;

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
  theme?: ThemeType;
  font?: FontType;
  readerLanguageMode?: ReaderLanguageMode;
  readerRate?: number;
  readerVoiceEn?: string;
  readerVoiceVi?: string;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: "notion",
      font: "notion-ui",
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

        if (version < PREFERENCES_STORE_VERSION) {
          state.readerVoiceEn = "";
          state.readerVoiceVi = "";
        }

        return state;
      },
    }
  )
);
