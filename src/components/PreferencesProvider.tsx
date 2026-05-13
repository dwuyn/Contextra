"use client";

import { usePreferencesStore } from "@/store/usePreferencesStore";
import { useEffect } from "react";

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { theme, font } = usePreferencesStore();

  useEffect(() => {
    const root = document.documentElement;
    
    // Remove previous theme classes
    const classes = Array.from(root.classList);
    classes.forEach(c => {
      if (c.startsWith('theme-') || c.startsWith('font-')) {
        root.classList.remove(c);
      }
    });

    // Add current classes
    root.classList.add(`theme-${theme}`);
    root.classList.add(`font-${font}`);
  }, [theme, font]);

  return <>{children}</>;
}
