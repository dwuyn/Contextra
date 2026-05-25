export type ThemeType =
  | "notion" | "notion-dark"
  | "mist" | "mist-dark"
  | "forest" | "forest-dark"
  | "cream" | "cream-dark"
  | "graphite" | "graphite-dark"
  | "rose" | "rose-dark"
  | "sage" | "sage-dark"
  | "harbor" | "harbor-dark"
  | "plum" | "plum-dark";

export type FontType =
  | "be-vietnam-pro"
  | "inter"
  | "manrope"
  | "noto-sans"
  | "ibm-plex-sans"
  | "source-serif-4"
  | "noto-serif"
  | "space-grotesk";

export const DEFAULT_THEME: ThemeType = "notion";
export const DEFAULT_FONT: FontType = "be-vietnam-pro";

export const THEME_OPTIONS: {
  id: ThemeType;
  name: string;
  swatches: string[];
  previewBg: string;
  previewCard: string;
  previewText: string;
  previewMuted: string;
  previewAccent: string;
  darkPreviewBg: string;
  darkPreviewCard: string;
  darkPreviewText: string;
  darkPreviewMuted: string;
  darkPreviewAccent: string;
}[] = [
  {
    id: "notion",
    name: "Notion",
    swatches: ["#2563eb", "#ffffff"],
    previewBg: "#f4f4f5",
    previewCard: "#ffffff",
    previewText: "#111827",
    previewMuted: "#64748b",
    previewAccent: "#2563eb",
    darkPreviewBg: "#1a1a1f",
    darkPreviewCard: "#25252d",
    darkPreviewText: "#e4e4e7",
    darkPreviewMuted: "#52525b",
    darkPreviewAccent: "#60a5fa",
  },
  {
    id: "mist",
    name: "Mist",
    swatches: ["#06b6d4", "#f8fcff"],
    previewBg: "#eaf6fb",
    previewCard: "#f8fcff",
    previewText: "#113442",
    previewMuted: "#54717d",
    previewAccent: "#06b6d4",
    darkPreviewBg: "#0d1f26",
    darkPreviewCard: "#1a2d35",
    darkPreviewText: "#d1e4ec",
    darkPreviewMuted: "#4e707e",
    darkPreviewAccent: "#22d3ee",
  },
  {
    id: "forest",
    name: "Forest",
    swatches: ["#059669", "#f8fffb"],
    previewBg: "#eaf8ef",
    previewCard: "#f8fffb",
    previewText: "#10291c",
    previewMuted: "#547363",
    previewAccent: "#059669",
    darkPreviewBg: "#0d1f18",
    darkPreviewCard: "#1a2d25",
    darkPreviewText: "#cfe4d8",
    darkPreviewMuted: "#4d7a60",
    darkPreviewAccent: "#34d399",
  },
  {
    id: "cream",
    name: "Cream",
    swatches: ["#d97706", "#fffdf5"],
    previewBg: "#fff8e6",
    previewCard: "#fffdf5",
    previewText: "#3b2b12",
    previewMuted: "#826b43",
    previewAccent: "#d97706",
    darkPreviewBg: "#1f1a10",
    darkPreviewCard: "#2d2618",
    darkPreviewText: "#e8dcc8",
    darkPreviewMuted: "#6b5d42",
    darkPreviewAccent: "#fbbf24",
  },
  {
    id: "graphite",
    name: "Graphite",
    swatches: ["#334155", "#f8fafc"],
    previewBg: "#f3f5f7",
    previewCard: "#ffffff",
    previewText: "#111827",
    previewMuted: "#64748b",
    previewAccent: "#334155",
    darkPreviewBg: "#171a1f",
    darkPreviewCard: "#242730",
    darkPreviewText: "#d1d5db",
    darkPreviewMuted: "#6b7280",
    darkPreviewAccent: "#94a3b8",
  },
  {
    id: "rose",
    name: "Rose",
    swatches: ["#e11d48", "#fffafb"],
    previewBg: "#fff1f3",
    previewCard: "#fffafb",
    previewText: "#3b1220",
    previewMuted: "#8a5363",
    previewAccent: "#e11d48",
    darkPreviewBg: "#1f1418",
    darkPreviewCard: "#2d1f23",
    darkPreviewText: "#e8cfd6",
    darkPreviewMuted: "#7a5565",
    darkPreviewAccent: "#fb7185",
  },
  {
    id: "sage",
    name: "Sage",
    swatches: ["#16a34a", "#f6fbf7"],
    previewBg: "#eef7f2",
    previewCard: "#fbfefc",
    previewText: "#153227",
    previewMuted: "#607466",
    previewAccent: "#16a34a",
    darkPreviewBg: "#111e18",
    darkPreviewCard: "#1e2a23",
    darkPreviewText: "#d0e4d5",
    darkPreviewMuted: "#5c7862",
    darkPreviewAccent: "#4ade80",
  },
  {
    id: "harbor",
    name: "Harbor",
    swatches: ["#0e7490", "#f4fbfc"],
    previewBg: "#e9f7f8",
    previewCard: "#f8fdfe",
    previewText: "#11363d",
    previewMuted: "#5c7780",
    previewAccent: "#0e7490",
    darkPreviewBg: "#0d1f22",
    darkPreviewCard: "#1a2c30",
    darkPreviewText: "#d0e5e8",
    darkPreviewMuted: "#52727e",
    darkPreviewAccent: "#22d3ee",
  },
  {
    id: "plum",
    name: "Plum",
    swatches: ["#9333ea", "#fdf8ff"],
    previewBg: "#f7edf8",
    previewCard: "#fdf8ff",
    previewText: "#2f183d",
    previewMuted: "#745b7e",
    previewAccent: "#9333ea",
    darkPreviewBg: "#1c1520",
    darkPreviewCard: "#2a2130",
    darkPreviewText: "#e0d1e8",
    darkPreviewMuted: "#705e80",
    darkPreviewAccent: "#c084fc",
  },
];

export const THEME_CARDS = THEME_OPTIONS.map(({ id, name, swatches }) => ({
  id,
  name,
  family: name,
  swatches: [swatches[0], swatches[1]],
}));

export function toggleThemeDark(theme: ThemeType): ThemeType {
  if (theme.endsWith("-dark")) {
    return theme.slice(0, -5) as ThemeType;
  }
  return (theme + "-dark") as ThemeType;
}

export const FONT_OPTIONS: {
  id: FontType;
  name: string;
  stack: string;
}[] = [
  {
    id: "be-vietnam-pro",
    name: "Be Vietnam Pro",
    stack: "'Be Vietnam Pro', 'Noto Sans Variable', system-ui, sans-serif",
  },
  {
    id: "inter",
    name: "Inter",
    stack: "'Inter Variable', 'Be Vietnam Pro', system-ui, sans-serif",
  },
  {
    id: "manrope",
    name: "Manrope",
    stack: "'Manrope Variable', 'Be Vietnam Pro', system-ui, sans-serif",
  },
  {
    id: "noto-sans",
    name: "Noto Sans",
    stack: "'Noto Sans Variable', 'Be Vietnam Pro', system-ui, sans-serif",
  },
  {
    id: "ibm-plex-sans",
    name: "IBM Plex Sans",
    stack: "'IBM Plex Sans Variable', 'Be Vietnam Pro', system-ui, sans-serif",
  },
  {
    id: "source-serif-4",
    name: "Source Serif 4",
    stack: "'Source Serif 4 Variable', 'Noto Serif Variable', serif",
  },
  {
    id: "noto-serif",
    name: "Noto Serif",
    stack: "'Noto Serif Variable', 'Source Serif 4 Variable', serif",
  },
  {
    id: "space-grotesk",
    name: "Space Grotesk",
    stack: "'Space Grotesk Variable', 'Be Vietnam Pro', system-ui, sans-serif",
  },
];

const THEME_IDS = new Set(THEME_OPTIONS.map((theme) => theme.id));
const FONT_IDS = new Set(FONT_OPTIONS.map((font) => font.id));

export function normalizeTheme(value: unknown): ThemeType {
  if (typeof value === "string") {
    if (value === "dark" || value === "midnight") {
      return "notion";
    }

    const isDark = value.endsWith("-dark");
    const base = isDark ? value.slice(0, -5) : value;
    if (THEME_IDS.has(base as ThemeType)) {
      return (base + (isDark ? "-dark" : "")) as ThemeType;
    }
  }

  return DEFAULT_THEME;
}

export function normalizeFont(value: unknown): FontType {
  if (value === "notion-ui") {
    return "be-vietnam-pro";
  }
  if (value === "literata") {
    return "source-serif-4";
  }
  if (value === "georgia") {
    return "noto-serif";
  }
  if (value === "verdana" || value === "trebuchet-ms") {
    return "noto-sans";
  }
  if (value === "courier-new") {
    return "ibm-plex-sans";
  }

  return typeof value === "string" && FONT_IDS.has(value as FontType)
    ? (value as FontType)
    : DEFAULT_FONT;
}
