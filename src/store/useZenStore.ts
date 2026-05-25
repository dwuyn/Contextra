"use client";

import { create } from "zustand";

interface ZenStore {
  isZenMode: boolean;
  toggleZen: () => void;
  enterZen: () => void;
  exitZen: () => void;
}

export const useZenStore = create<ZenStore>((set) => ({
  isZenMode: false,
  toggleZen: () => set((s) => ({ isZenMode: !s.isZenMode })),
  enterZen: () => set({ isZenMode: true }),
  exitZen: () => set({ isZenMode: false }),
}));
