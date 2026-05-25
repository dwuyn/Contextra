import { describe, it, expect } from "vitest";

import {
  normalizeTheme,
  normalizeFont,
  toggleThemeDark,
  DEFAULT_THEME,
  DEFAULT_FONT,
  type ThemeType,
  type FontType,
} from "@/lib/appearance";

// ---------------------------------------------------------------------------
// normalizeTheme
// ---------------------------------------------------------------------------

describe("normalizeTheme", () => {
  const VALID_THEMES: ThemeType[] = [
    "notion",
    "mist",
    "forest",
    "cream",
    "graphite",
    "rose",
    "sage",
    "harbor",
    "plum",
  ];

  describe("valid theme names", () => {
    it.each(VALID_THEMES)("passes through %s unchanged", (theme) => {
      expect(normalizeTheme(theme)).toBe(theme);
    });
  });

  describe("unknown theme names", () => {
    it("returns DEFAULT_THEME for unrecognized strings", () => {
      expect(normalizeTheme("ocean")).toBe(DEFAULT_THEME);
      expect(normalizeTheme("sunset")).toBe(DEFAULT_THEME);
      expect(normalizeTheme("")).toBe(DEFAULT_THEME);
      expect(normalizeTheme("random-value")).toBe(DEFAULT_THEME);
    });
  });

  describe("legacy values", () => {
    it('maps "dark" to "notion"', () => {
      expect(normalizeTheme("dark")).toBe("notion");
    });

    it('maps "midnight" to "notion"', () => {
      expect(normalizeTheme("midnight")).toBe("notion");
    });
  });

  describe("dark suffix preserving", () => {
    it('preserves -dark on "notion-dark"', () => {
      expect(normalizeTheme("notion-dark")).toBe("notion-dark");
    });

    it('preserves -dark on "mist-dark"', () => {
      expect(normalizeTheme("mist-dark")).toBe("mist-dark");
    });

    it('preserves -dark on "forest-dark"', () => {
      expect(normalizeTheme("forest-dark")).toBe("forest-dark");
    });

    it('preserves -dark on other valid themes', () => {
      expect(normalizeTheme("cream-dark")).toBe("cream-dark");
      expect(normalizeTheme("graphite-dark")).toBe("graphite-dark");
      expect(normalizeTheme("rose-dark")).toBe("rose-dark");
      expect(normalizeTheme("sage-dark")).toBe("sage-dark");
      expect(normalizeTheme("harbor-dark")).toBe("harbor-dark");
      expect(normalizeTheme("plum-dark")).toBe("plum-dark");
    });

    it('returns DEFAULT_THEME when -dark is on an unknown theme', () => {
      expect(normalizeTheme("ocean-dark")).toBe(DEFAULT_THEME);
    });
  });

  describe("undefined / null", () => {
    it("returns DEFAULT_THEME for undefined", () => {
      expect(normalizeTheme(undefined)).toBe(DEFAULT_THEME);
    });

    it("returns DEFAULT_THEME for null", () => {
      expect(normalizeTheme(null)).toBe(DEFAULT_THEME);
    });
  });

  describe("non-string values", () => {
    it("returns DEFAULT_THEME for numbers", () => {
      expect(normalizeTheme(42)).toBe(DEFAULT_THEME);
    });

    it("returns DEFAULT_THEME for booleans", () => {
      expect(normalizeTheme(true)).toBe(DEFAULT_THEME);
      expect(normalizeTheme(false)).toBe(DEFAULT_THEME);
    });

    it("returns DEFAULT_THEME for objects", () => {
      expect(normalizeTheme({})).toBe(DEFAULT_THEME);
      expect(normalizeTheme({ theme: "mist" })).toBe(DEFAULT_THEME);
    });

    it("returns DEFAULT_THEME for arrays", () => {
      expect(normalizeTheme(["notion"])).toBe(DEFAULT_THEME);
    });
  });
});

// ---------------------------------------------------------------------------
// normalizeFont
// ---------------------------------------------------------------------------

describe("normalizeFont", () => {
  const VALID_FONTS: FontType[] = [
    "be-vietnam-pro",
    "inter",
    "manrope",
    "noto-sans",
    "ibm-plex-sans",
    "source-serif-4",
    "noto-serif",
    "space-grotesk",
  ];

  describe("valid font names", () => {
    it.each(VALID_FONTS)("passes through %s unchanged", (font) => {
      expect(normalizeFont(font)).toBe(font);
    });
  });

  describe("unknown font names", () => {
    it("returns DEFAULT_FONT for unrecognized strings", () => {
      expect(normalizeFont("arial")).toBe(DEFAULT_FONT);
      expect(normalizeFont("helvetica")).toBe(DEFAULT_FONT);
      expect(normalizeFont("")).toBe(DEFAULT_FONT);
      expect(normalizeFont("unknown-font")).toBe(DEFAULT_FONT);
    });
  });

  describe("legacy font mappings", () => {
    it('maps "notion-ui" to "be-vietnam-pro"', () => {
      expect(normalizeFont("notion-ui")).toBe("be-vietnam-pro");
    });

    it('maps "literata" to "source-serif-4"', () => {
      expect(normalizeFont("literata")).toBe("source-serif-4");
    });

    it('maps "georgia" to "noto-serif"', () => {
      expect(normalizeFont("georgia")).toBe("noto-serif");
    });

    it('maps "verdana" to "noto-sans"', () => {
      expect(normalizeFont("verdana")).toBe("noto-sans");
    });

    it('maps "trebuchet-ms" to "noto-sans"', () => {
      expect(normalizeFont("trebuchet-ms")).toBe("noto-sans");
    });

    it('maps "courier-new" to "ibm-plex-sans"', () => {
      expect(normalizeFont("courier-new")).toBe("ibm-plex-sans");
    });
  });

  describe("undefined / null", () => {
    it("returns DEFAULT_FONT for undefined", () => {
      expect(normalizeFont(undefined)).toBe(DEFAULT_FONT);
    });

    it("returns DEFAULT_FONT for null", () => {
      expect(normalizeFont(null)).toBe(DEFAULT_FONT);
    });
  });

  describe("non-string values", () => {
    it("returns DEFAULT_FONT for numbers", () => {
      expect(normalizeFont(123)).toBe(DEFAULT_FONT);
    });

    it("returns DEFAULT_FONT for booleans", () => {
      expect(normalizeFont(true)).toBe(DEFAULT_FONT);
      expect(normalizeFont(false)).toBe(DEFAULT_FONT);
    });

    it("returns DEFAULT_FONT for objects", () => {
      expect(normalizeFont({})).toBe(DEFAULT_FONT);
    });
  });
});

// ---------------------------------------------------------------------------
// toggleThemeDark
// ---------------------------------------------------------------------------

describe("toggleThemeDark", () => {
  it("adds -dark suffix to a light theme", () => {
    expect(toggleThemeDark("notion")).toBe("notion-dark");
    expect(toggleThemeDark("mist")).toBe("mist-dark");
    expect(toggleThemeDark("forest")).toBe("forest-dark");
  });

  it("removes -dark suffix from a dark theme", () => {
    expect(toggleThemeDark("notion-dark")).toBe("notion");
    expect(toggleThemeDark("mist-dark")).toBe("mist");
    expect(toggleThemeDark("plum-dark")).toBe("plum");
  });
});
