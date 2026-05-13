import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeType = "notion" | "mist" | "forest" | "cream" | "graphite" | "rose" | "dark";
export type FontType = "notion-ui" | "manrope" | "literata" | "space-grotesk" | "georgia" | "verdana" | "trebuchet-ms" | "courier-new";

interface PreferencesState {
  theme: ThemeType;
  font: FontType;
  setTheme: (theme: ThemeType) => void;
  setFont: (font: FontType) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: "notion",
      font: "notion-ui",
      setTheme: (theme) => set({ theme }),
      setFont: (font) => set({ font }),
    }),
    {
      name: "contextra-preferences",
    }
  )
);
