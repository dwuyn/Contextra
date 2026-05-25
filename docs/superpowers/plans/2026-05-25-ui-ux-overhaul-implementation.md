# UI/UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Contextra's UI from a light-only, hardcoded-color codebase into a fully themable (18 themes), i18n-ready, accessible, and performant writing workspace with zen mode and command palette.

**Architecture:** Foundation-first approach. Phase 1 establishes semantic CSS token system + 18 theme classes (prerequisite for everything). Phase 2 migrates all components to tokens and sets up next-intl. Phase 3 fixes a11y and removes dead UI. Phase 4 adds zen mode and command palette. Phase 5 optimizes performance and polishes the landing page.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, Zustand, Radix UI (Dialog, Tooltip), next-intl, Lucide icons

---

## Prerequisites

```bash
npm install next-intl @radix-ui/react-tooltip @radix-ui/react-scroll-area
```

---

## Phase 1: Design Token Architecture + Dark Mode

### Task 1: Define token system in globals.css

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace the current CSS custom properties and theme classes**

Replace lines 1-149 of `src/app/globals.css` with the following:

```css
@import "tailwindcss";
@import "tailwind-animate";

:root {
  --font-be-vietnam-pro: "Be Vietnam Pro", "Noto Sans Variable", ui-sans-serif, system-ui, sans-serif;
  --font-inter: "Inter Variable", "Be Vietnam Pro", ui-sans-serif, system-ui, sans-serif;
  --font-manrope: "Manrope Variable", "Be Vietnam Pro", ui-sans-serif, system-ui, sans-serif;
  --font-noto-sans: "Noto Sans Variable", "Be Vietnam Pro", ui-sans-serif, system-ui, sans-serif;
  --font-ibm-plex-sans: "IBM Plex Sans Variable", "Be Vietnam Pro", ui-sans-serif, system-ui, sans-serif;
  --font-source-serif-4: "Source Serif 4 Variable", "Noto Serif Variable", ui-serif, Georgia, serif;
  --font-noto-serif: "Noto Serif Variable", "Source Serif 4 Variable", ui-serif, Georgia, serif;
  --font-space-grotesk: "Space Grotesk Variable", "Be Vietnam Pro", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  --font-family: var(--font-be-vietnam-pro);
}

/* ===== Semantic Color Tokens ===== */

/* Light defaults (Notion) */
.theme-notion {
  --color-canvas: #f7f7f5;
  --color-surface: #ffffff;
  --color-surface-alt: #f4f4f5;
  --color-border: #e2e8f0;
  --color-text: #0f172a;
  --color-text-secondary: #475569;
  --color-text-muted: #94a3b8;
  --color-accent: #2563eb;
  --color-accent-muted: #eff6ff;
  --color-success: #059669;
  --color-destructive: #dc2626;
  color-scheme: light;
}

.theme-notion-dark {
  --color-canvas: #1a1a1f;
  --color-surface: #25252d;
  --color-surface-alt: #2e2e38;
  --color-border: #393945;
  --color-text: #e4e4e7;
  --color-text-secondary: #a1a1aa;
  --color-text-muted: #52525b;
  --color-accent: #60a5fa;
  --color-accent-muted: #1e3a5f;
  --color-success: #34d399;
  --color-destructive: #f87171;
  color-scheme: dark;
}

.theme-mist {
  --color-canvas: #eaf6fb;
  --color-surface: #f8fcff;
  --color-surface-alt: #e0eff7;
  --color-border: #cde4f0;
  --color-text: #113442;
  --color-text-secondary: #54717d;
  --color-text-muted: #8aa4b0;
  --color-accent: #06b6d4;
  --color-accent-muted: #ecfeff;
  --color-success: #059669;
  --color-destructive: #dc2626;
  color-scheme: light;
}

.theme-mist-dark {
  --color-canvas: #0d1f26;
  --color-surface: #1a2d35;
  --color-surface-alt: #233942;
  --color-border: #2e4a56;
  --color-text: #d1e4ec;
  --color-text-secondary: #89b0c0;
  --color-text-muted: #4e707e;
  --color-accent: #22d3ee;
  --color-accent-muted: #164e63;
  --color-success: #34d399;
  --color-destructive: #f87171;
  color-scheme: dark;
}

.theme-forest {
  --color-canvas: #eaf8ef;
  --color-surface: #f8fffb;
  --color-surface-alt: #dfefe4;
  --color-border: #c5e0cf;
  --color-text: #10291c;
  --color-text-secondary: #547363;
  --color-text-muted: #8a9e90;
  --color-accent: #059669;
  --color-accent-muted: #ecfdf5;
  --color-success: #16a34a;
  --color-destructive: #dc2626;
  color-scheme: light;
}

.theme-forest-dark {
  --color-canvas: #0d1f18;
  --color-surface: #1a2d25;
  --color-surface-alt: #233a30;
  --color-border: #2e4d3e;
  --color-text: #cfe4d8;
  --color-text-secondary: #84b59a;
  --color-text-muted: #4d7a60;
  --color-accent: #34d399;
  --color-accent-muted: #14532d;
  --color-success: #4ade80;
  --color-destructive: #f87171;
  color-scheme: dark;
}

.theme-cream {
  --color-canvas: #fff8e6;
  --color-surface: #fffdf5;
  --color-surface-alt: #f7efdb;
  --color-border: #e8dcc8;
  --color-text: #3b2b12;
  --color-text-secondary: #826b43;
  --color-text-muted: #b8a57a;
  --color-accent: #d97706;
  --color-accent-muted: #fffbeb;
  --color-success: #059669;
  --color-destructive: #dc2626;
  color-scheme: light;
}

.theme-cream-dark {
  --color-canvas: #1f1a10;
  --color-surface: #2d2618;
  --color-surface-alt: #3b3222;
  --color-border: #4e4330;
  --color-text: #e8dcc8;
  --color-text-secondary: #b8a57a;
  --color-text-muted: #6b5d42;
  --color-accent: #fbbf24;
  --color-accent-muted: #451a03;
  --color-success: #34d399;
  --color-destructive: #f87171;
  color-scheme: dark;
}

.theme-graphite {
  --color-canvas: #f3f5f7;
  --color-surface: #ffffff;
  --color-surface-alt: #e9ecef;
  --color-border: #d1d5db;
  --color-text: #111827;
  --color-text-secondary: #4b5563;
  --color-text-muted: #9ca3af;
  --color-accent: #334155;
  --color-accent-muted: #f1f5f9;
  --color-success: #059669;
  --color-destructive: #dc2626;
  color-scheme: light;
}

.theme-graphite-dark {
  --color-canvas: #171a1f;
  --color-surface: #242730;
  --color-surface-alt: #30333d;
  --color-border: #3f4350;
  --color-text: #d1d5db;
  --color-text-secondary: #9ca3af;
  --color-text-muted: #6b7280;
  --color-accent: #94a3b8;
  --color-accent-muted: #1e293b;
  --color-success: #34d399;
  --color-destructive: #f87171;
  color-scheme: dark;
}

.theme-rose {
  --color-canvas: #fff1f3;
  --color-surface: #fffafb;
  --color-surface-alt: #fde5e9;
  --color-border: #f0cfd6;
  --color-text: #3b1220;
  --color-text-secondary: #8a5363;
  --color-text-muted: #c48a98;
  --color-accent: #e11d48;
  --color-accent-muted: #fff1f2;
  --color-success: #059669;
  --color-destructive: #dc2626;
  color-scheme: light;
}

.theme-rose-dark {
  --color-canvas: #1f1418;
  --color-surface: #2d1f23;
  --color-surface-alt: #3b2930;
  --color-border: #4e353d;
  --color-text: #e8cfd6;
  --color-text-secondary: #c48a98;
  --color-text-muted: #7a5565;
  --color-accent: #fb7185;
  --color-accent-muted: #4c0519;
  --color-success: #34d399;
  --color-destructive: #f87171;
  color-scheme: dark;
}

.theme-sage {
  --color-canvas: #eef7f2;
  --color-surface: #fbfefc;
  --color-surface-alt: #e1f0e5;
  --color-border: #c5dfcb;
  --color-text: #153227;
  --color-text-secondary: #607466;
  --color-text-muted: #95ab99;
  --color-accent: #16a34a;
  --color-accent-muted: #f0fdf4;
  --color-success: #059669;
  --color-destructive: #dc2626;
  color-scheme: light;
}

.theme-sage-dark {
  --color-canvas: #111e18;
  --color-surface: #1e2a23;
  --color-surface-alt: #28382e;
  --color-border: #364a3b;
  --color-text: #d0e4d5;
  --color-text-secondary: #95ab99;
  --color-text-muted: #5c7862;
  --color-accent: #4ade80;
  --color-accent-muted: #14532d;
  --color-success: #4ade80;
  --color-destructive: #f87171;
  color-scheme: dark;
}

.theme-harbor {
  --color-canvas: #e9f7f8;
  --color-surface: #f8fdfe;
  --color-surface-alt: #ddf0f2;
  --color-border: #c0e2e5;
  --color-text: #11363d;
  --color-text-secondary: #5c7780;
  --color-text-muted: #8fadba;
  --color-accent: #0e7490;
  --color-accent-muted: #ecfeff;
  --color-success: #059669;
  --color-destructive: #dc2626;
  color-scheme: light;
}

.theme-harbor-dark {
  --color-canvas: #0d1f22;
  --color-surface: #1a2c30;
  --color-surface-alt: #23393e;
  --color-border: #2e4a50;
  --color-text: #d0e5e8;
  --color-text-secondary: #8bb0ba;
  --color-text-muted: #52727e;
  --color-accent: #22d3ee;
  --color-accent-muted: #164e63;
  --color-success: #34d399;
  --color-destructive: #f87171;
  color-scheme: dark;
}

.theme-plum {
  --color-canvas: #f7edf8;
  --color-surface: #fdf8ff;
  --color-surface-alt: #f0e3f2;
  --color-border: #e0cbe6;
  --color-text: #2f183d;
  --color-text-secondary: #745b7e;
  --color-text-muted: #a88db5;
  --color-accent: #9333ea;
  --color-accent-muted: #faf5ff;
  --color-success: #059669;
  --color-destructive: #dc2626;
  color-scheme: light;
}

.theme-plum-dark {
  --color-canvas: #1c1520;
  --color-surface: #2a2130;
  --color-surface-alt: #382d40;
  --color-border: #4a3b52;
  --color-text: #e0d1e8;
  --color-text-secondary: #b595c0;
  --color-text-muted: #705e80;
  --color-accent: #c084fc;
  --color-accent-muted: #3b0764;
  --color-success: #34d399;
  --color-destructive: #f87171;
  color-scheme: dark;
}

/* ===== Font families ===== */
.font-be-vietnam-pro { --font-family: var(--font-be-vietnam-pro); }
.font-inter { --font-family: var(--font-inter); }
.font-manrope { --font-family: var(--font-manrope); }
.font-noto-sans { --font-family: var(--font-noto-sans); }
.font-ibm-plex-sans { --font-family: var(--font-ibm-plex-sans); }
.font-source-serif-4 { --font-family: var(--font-source-serif-4); }
.font-noto-serif { --font-family: var(--font-noto-serif); }
.font-space-grotesk { --font-family: var(--font-space-grotesk); }

/* ===== Body ===== */
body {
  color: var(--color-text);
  background: var(--color-canvas);
  font-family: var(--font-family);
  transition: background-color 0.3s ease, color 0.3s ease;
}

/* ===== Smooth theme toggle ===== */
* {
  transition-property: background-color, border-color, color;
  transition-duration: 0.15s;
  transition-timing-function: ease;
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}

/* ===== Editor-specific tokens ===== */
body {
  --color-editor-bg: var(--color-surface);
  --color-editor-table-border: var(--color-border);
  --color-editor-table-header: var(--color-surface-alt);
}

/* ===== Editor styles ===== */
.editor-surface:empty::before {
  content: attr(data-placeholder);
  color: var(--color-text-muted);
  pointer-events: none;
}

.editor-surface {
  outline: none;
  min-height: 100%;
  padding: 0;
}

.editor-surface p {
  margin-bottom: 0.75em;
  line-height: 1.75;
}

.editor-surface h1 { font-size: 2em; font-weight: 700; margin: 1em 0 0.5em; }
.editor-surface h2 { font-size: 1.5em; font-weight: 600; margin: 1em 0 0.5em; }
.editor-surface h3 { font-size: 1.25em; font-weight: 600; margin: 0.75em 0 0.5em; }

.editor-surface ul, .editor-surface ol { padding-left: 1.5em; margin-bottom: 0.75em; }
.editor-surface li { margin-bottom: 0.25em; }

.editor-surface blockquote {
  border-left: 3px solid var(--color-accent);
  padding-left: 1em;
  color: var(--color-text-secondary);
  margin: 0.75em 0;
}

.editor-surface img { max-width: 100%; height: auto; border-radius: 0.5rem; margin: 1em 0; }

.editor-surface table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  overflow: hidden;
}
.editor-surface th {
  background: var(--color-editor-table-header);
  border: 1px solid var(--color-editor-table-border);
  padding: 0.5em 0.75em;
  text-align: left;
  font-weight: 600;
}
.editor-surface td {
  border: 1px solid var(--color-editor-table-border);
  padding: 0.5em 0.75em;
}

.editor-surface hr {
  border: none;
  border-top: 2px solid var(--color-border);
  margin: 1.5em 0;
}

/* Comment thread highlight */
[data-comment-thread-id] {
  background-color: rgba(251, 191, 36, 0.3);
  border-radius: 2px;
}

/* AI-generated highlight */
[data-ai-generated] {
  background-color: rgba(99, 102, 241, 0.12);
  border-radius: 2px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add semantic color tokens and 18 theme classes (9 light + 9 dark)"
```

---

### Task 2: Update appearance.ts for dark themes

**Files:**
- Modify: `src/lib/appearance.ts`

- [ ] **Step 1: Update the types and options**

Replace `src/lib/appearance.ts` with:

```ts
export type ThemeType =
  | "notion"       | "notion-dark"
  | "mist"         | "mist-dark"
  | "forest"       | "forest-dark"
  | "cream"        | "cream-dark"
  | "graphite"     | "graphite-dark"
  | "rose"         | "rose-dark"
  | "sage"         | "sage-dark"
  | "harbor"       | "harbor-dark"
  | "plum"         | "plum-dark";

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

export interface ThemeOption {
  id: ThemeType;
  name: string;
  family: string;
  isDark: boolean;
  swatches: string[];
  previewBg: string;
  previewCard: string;
  previewText: string;
  previewMuted: string;
  previewAccent: string;
}

export const THEME_FAMILIES: { family: "notion" | "mist" | "forest" | "cream" | "graphite" | "rose" | "sage" | "harbor" | "plum"; name: string }[] = [
  { family: "notion", name: "Notion" },
  { family: "mist", name: "Mist" },
  { family: "forest", name: "Forest" },
  { family: "cream", name: "Cream" },
  { family: "graphite", name: "Graphite" },
  { family: "rose", name: "Rose" },
  { family: "sage", name: "Sage" },
  { family: "harbor", name: "Harbor" },
  { family: "plum", name: "Plum" },
];

export function getThemeLight(family: ThemeType): ThemeType {
  const base = family.replace("-dark", "") as ThemeType;
  return (THEME_IDS.has(base) ? base : "notion") as ThemeType;
}

export function getThemeDark(family: ThemeType): ThemeType {
  const base = family.replace("-dark", "") as ThemeType;
  const dark = (base + "-dark") as ThemeType;
  return THEME_IDS.has(dark) ? dark : DEFAULT_THEME;
}

export function toggleThemeDark(theme: ThemeType): ThemeType {
  return theme.endsWith("-dark") ? getThemeLight(theme) : getThemeDark(theme);
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "notion", name: "Notion Light", family: "Notion", isDark: false,
    swatches: ["#2563eb", "#ffffff"],
    previewBg: "#f4f4f5", previewCard: "#ffffff", previewText: "#111827",
    previewMuted: "#64748b", previewAccent: "#2563eb",
  },
  {
    id: "notion-dark", name: "Notion Dark", family: "Notion", isDark: true,
    swatches: ["#60a5fa", "#25252d"],
    previewBg: "#1a1a1f", previewCard: "#25252d", previewText: "#e4e4e7",
    previewMuted: "#52525b", previewAccent: "#60a5fa",
  },
  {
    id: "mist", name: "Mist Light", family: "Mist", isDark: false,
    swatches: ["#06b6d4", "#f8fcff"],
    previewBg: "#eaf6fb", previewCard: "#f8fcff", previewText: "#113442",
    previewMuted: "#5c7780", previewAccent: "#06b6d4",
  },
  {
    id: "mist-dark", name: "Mist Dark", family: "Mist", isDark: true,
    swatches: ["#22d3ee", "#1a2d35"],
    previewBg: "#0d1f26", previewCard: "#1a2d35", previewText: "#d1e4ec",
    previewMuted: "#4e707e", previewAccent: "#22d3ee",
  },
  {
    id: "forest", name: "Forest Light", family: "Forest", isDark: false,
    swatches: ["#059669", "#f8fffb"],
    previewBg: "#eaf8ef", previewCard: "#f8fffb", previewText: "#10291c",
    previewMuted: "#547363", previewAccent: "#059669",
  },
  {
    id: "forest-dark", name: "Forest Dark", family: "Forest", isDark: true,
    swatches: ["#34d399", "#1a2d25"],
    previewBg: "#0d1f18", previewCard: "#1a2d25", previewText: "#cfe4d8",
    previewMuted: "#4d7a60", previewAccent: "#34d399",
  },
  {
    id: "cream", name: "Cream Light", family: "Cream", isDark: false,
    swatches: ["#d97706", "#fffdf5"],
    previewBg: "#fff8e6", previewCard: "#fffdf5", previewText: "#3b2b12",
    previewMuted: "#826b43", previewAccent: "#d97706",
  },
  {
    id: "cream-dark", name: "Cream Dark", family: "Cream", isDark: true,
    swatches: ["#fbbf24", "#2d2618"],
    previewBg: "#1f1a10", previewCard: "#2d2618", previewText: "#e8dcc8",
    previewMuted: "#6b5d42", previewAccent: "#fbbf24",
  },
  {
    id: "graphite", name: "Graphite Light", family: "Graphite", isDark: false,
    swatches: ["#334155", "#f8fafc"],
    previewBg: "#f3f5f7", previewCard: "#ffffff", previewText: "#111827",
    previewMuted: "#64748b", previewAccent: "#334155",
  },
  {
    id: "graphite-dark", name: "Graphite Dark", family: "Graphite", isDark: true,
    swatches: ["#94a3b8", "#242730"],
    previewBg: "#171a1f", previewCard: "#242730", previewText: "#d1d5db",
    previewMuted: "#6b7280", previewAccent: "#94a3b8",
  },
  {
    id: "rose", name: "Rose Light", family: "Rose", isDark: false,
    swatches: ["#e11d48", "#fffafb"],
    previewBg: "#fff1f3", previewCard: "#fffafb", previewText: "#3b1220",
    previewMuted: "#8a5363", previewAccent: "#e11d48",
  },
  {
    id: "rose-dark", name: "Rose Dark", family: "Rose", isDark: true,
    swatches: ["#fb7185", "#2d1f23"],
    previewBg: "#1f1418", previewCard: "#2d1f23", previewText: "#e8cfd6",
    previewMuted: "#7a5565", previewAccent: "#fb7185",
  },
  {
    id: "sage", name: "Sage Light", family: "Sage", isDark: false,
    swatches: ["#16a34a", "#f6fbf7"],
    previewBg: "#eef7f2", previewCard: "#fbfefc", previewText: "#153227",
    previewMuted: "#607466", previewAccent: "#16a34a",
  },
  {
    id: "sage-dark", name: "Sage Dark", family: "Sage", isDark: true,
    swatches: ["#4ade80", "#1e2a23"],
    previewBg: "#111e18", previewCard: "#1e2a23", previewText: "#d0e4d5",
    previewMuted: "#5c7862", previewAccent: "#4ade80",
  },
  {
    id: "harbor", name: "Harbor Light", family: "Harbor", isDark: false,
    swatches: ["#0e7490", "#f4fbfc"],
    previewBg: "#e9f7f8", previewCard: "#f8fdfe", previewText: "#11363d",
    previewMuted: "#5c7780", previewAccent: "#0e7490",
  },
  {
    id: "harbor-dark", name: "Harbor Dark", family: "Harbor", isDark: true,
    swatches: ["#22d3ee", "#1a2c30"],
    previewBg: "#0d1f22", previewCard: "#1a2c30", previewText: "#d0e5e8",
    previewMuted: "#52727e", previewAccent: "#22d3ee",
  },
  {
    id: "plum", name: "Plum Light", family: "Plum", isDark: false,
    swatches: ["#9333ea", "#fdf8ff"],
    previewBg: "#f7edf8", previewCard: "#fdf8ff", previewText: "#2f183d",
    previewMuted: "#745b7e", previewAccent: "#9333ea",
  },
  {
    id: "plum-dark", name: "Plum Dark", family: "Plum", isDark: true,
    swatches: ["#c084fc", "#2a2130"],
    previewBg: "#1c1520", previewCard: "#2a2130", previewText: "#e0d1e8",
    previewMuted: "#705e80", previewAccent: "#c084fc",
  },
];

export const THEME_CARDS: { id: ThemeType; family: string; swatches: string[] }[] = [
  { id: "notion", family: "Notion", swatches: ["#2563eb", "#f7f7f5"] },
  { id: "mist", family: "Mist", swatches: ["#06b6d4", "#eaf6fb"] },
  { id: "forest", family: "Forest", swatches: ["#059669", "#eaf8ef"] },
  { id: "cream", family: "Cream", swatches: ["#d97706", "#fff8e6"] },
  { id: "graphite", family: "Graphite", swatches: ["#334155", "#f3f5f7"] },
  { id: "rose", family: "Rose", swatches: ["#e11d48", "#fff1f3"] },
  { id: "sage", family: "Sage", swatches: ["#16a34a", "#eef7f2"] },
  { id: "harbor", family: "Harbor", swatches: ["#0e7490", "#e9f7f8"] },
  { id: "plum", family: "Plum", swatches: ["#9333ea", "#f7edf8"] },
];

export const FONT_OPTIONS: {
  id: FontType;
  name: string;
  stack: string;
}[] = [
  { id: "be-vietnam-pro", name: "Be Vietnam Pro", stack: "'Be Vietnam Pro', 'Noto Sans Variable', system-ui, sans-serif" },
  { id: "inter", name: "Inter", stack: "'Inter Variable', 'Be Vietnam Pro', system-ui, sans-serif" },
  { id: "manrope", name: "Manrope", stack: "'Manrope Variable', 'Be Vietnam Pro', system-ui, sans-serif" },
  { id: "noto-sans", name: "Noto Sans", stack: "'Noto Sans Variable', 'Be Vietnam Pro', system-ui, sans-serif" },
  { id: "ibm-plex-sans", name: "IBM Plex Sans", stack: "'IBM Plex Sans Variable', 'Be Vietnam Pro', system-ui, sans-serif" },
  { id: "source-serif-4", name: "Source Serif 4", stack: "'Source Serif 4 Variable', 'Noto Serif Variable', serif" },
  { id: "noto-serif", name: "Noto Serif", stack: "'Noto Serif Variable', 'Source Serif 4 Variable', serif" },
  { id: "space-grotesk", name: "Space Grotesk", stack: "'Space Grotesk Variable', 'Be Vietnam Pro', system-ui, sans-serif" },
];

const THEME_IDS = new Set(THEME_OPTIONS.map((t) => t.id));
const FONT_IDS = new Set(FONT_OPTIONS.map((f) => f.id));

export function normalizeTheme(value: unknown): ThemeType {
  if (value === "dark" || value === "midnight") return "notion-dark";
  return typeof value === "string" && THEME_IDS.has(value as ThemeType)
    ? (value as ThemeType)
    : DEFAULT_THEME;
}

export function normalizeFont(value: unknown): FontType {
  if (value === "notion-ui") return "be-vietnam-pro";
  if (value === "literata") return "source-serif-4";
  if (value === "georgia") return "noto-serif";
  if (value === "verdana" || value === "trebuchet-ms") return "noto-sans";
  if (value === "courier-new") return "ibm-plex-sans";
  return typeof value === "string" && FONT_IDS.has(value as FontType)
    ? (value as FontType)
    : DEFAULT_FONT;
}
```

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/appearance.ts
git commit -m "feat: add 18-theme type system with dark variants to appearance module"
```

---

### Task 3: Add flash-prevention inline script to layout.tsx

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add pre-paint theme script**

Read `src/app/layout.tsx` first, then add the following inline script inside `<head>`:

```tsx
<head>
  <script
    dangerouslySetInnerHTML={{
      __html: `
        (function() {
          try {
            var stored = localStorage.getItem('contextra-preferences');
            var theme = 'notion';
            var font = 'be-vietnam-pro';
            if (stored) {
              var prefs = JSON.parse(stored);
              var state = prefs.state || {};
              if (state.theme) theme = state.theme;
              if (state.font) font = state.font;
            } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
              theme = 'notion-dark';
            }
            document.documentElement.classList.add('theme-' + theme);
            document.documentElement.classList.add('font-' + font);
            document.documentElement.setAttribute('data-theme', theme);
            document.documentElement.setAttribute('data-font', font);
          } catch(e) {}
        })();
      `,
    }}
  />
</head>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: add inline script to prevent FOUC on dark mode load"
```

---

### Task 4: Test theme system

**Files:**
- Test: `src/lib/appearance.test.ts` (new)

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect } from "vitest";
import {
  normalizeTheme,
  normalizeFont,
  toggleThemeDark,
  getThemeLight,
  getThemeDark,
  DEFAULT_THEME,
  DEFAULT_FONT,
} from "@/lib/appearance";

describe("normalizeTheme", () => {
  it("returns default for unknown values", () => {
    expect(normalizeTheme(undefined)).toBe(DEFAULT_THEME);
    expect(normalizeTheme("")).toBe(DEFAULT_THEME);
    expect(normalizeTheme("xyz")).toBe(DEFAULT_THEME);
  });

  it("returns valid light themes", () => {
    expect(normalizeTheme("notion")).toBe("notion");
    expect(normalizeTheme("mist")).toBe("mist");
    expect(normalizeTheme("plum")).toBe("plum");
  });

  it("returns valid dark themes", () => {
    expect(normalizeTheme("notion-dark")).toBe("notion-dark");
    expect(normalizeTheme("mist-dark")).toBe("mist-dark");
  });

  it("maps legacy 'dark' to notion-dark", () => {
    expect(normalizeTheme("dark")).toBe("notion-dark");
  });

  it("maps legacy 'midnight' to notion-dark", () => {
    expect(normalizeTheme("midnight")).toBe("notion-dark");
  });
});

describe("normalizeFont", () => {
  it("returns default for unknown values", () => {
    expect(normalizeFont(undefined)).toBe(DEFAULT_FONT);
    expect(normalizeFont("")).toBe(DEFAULT_FONT);
  });

  it("returns valid fonts", () => {
    expect(normalizeFont("inter")).toBe("inter");
    expect(normalizeFont("source-serif-4")).toBe("source-serif-4");
  });
});

describe("toggleThemeDark", () => {
  it("toggles light to dark", () => {
    expect(toggleThemeDark("notion")).toBe("notion-dark");
    expect(toggleThemeDark("mist")).toBe("mist-dark");
  });

  it("toggles dark to light", () => {
    expect(toggleThemeDark("notion-dark")).toBe("notion");
    expect(toggleThemeDark("mist-dark")).toBe("mist");
  });
});

describe("getThemeLight", () => {
  it("returns light for dark", () => {
    expect(getThemeLight("notion-dark" as any)).toBe("notion");
  });

  it("returns light for light", () => {
    expect(getThemeLight("notion" as any)).toBe("notion");
  });
});

describe("getThemeDark", () => {
  it("returns dark for light", () => {
    expect(getThemeDark("notion" as any)).toBe("notion-dark");
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest src/lib/appearance.test.ts --run
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/appearance.test.ts
git commit -m "test: add unit tests for theme normalization and dark toggle"
```

---

### Task 5: Update PreferencesModal — add dark mode toggle

**Files:**
- Modify: `src/components/PreferencesModal.tsx`

- [ ] **Step 1: Add dark toggle to the appearance tab**

Read `src/components/PreferencesModal.tsx` first. In the `appearance` tab section, before the theme swatch grid, add:

```tsx
import { Sun, Moon } from "lucide-react";
import { toggleThemeDark, THEME_CARDS } from "@/lib/appearance";

// Inside the appearance tab content, before the theme swatch section:
<div className="flex items-center justify-between mb-4">
  <span className="text-sm font-medium">Dark mode</span>
  <button
    type="button"
    onClick={() => setTheme(toggleThemeDark(theme))}
    className={cn(
      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
      theme.endsWith("-dark")
        ? "bg-[var(--color-accent)]"
        : "bg-[var(--color-border)]"
    )}
    role="switch"
    aria-checked={theme.endsWith("-dark")}
    aria-label="Toggle dark mode"
  >
    <span
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform",
        theme.endsWith("-dark") ? "translate-x-5" : "translate-x-0.5"
      )}
    >
      {theme.endsWith("-dark") ? (
        <Moon className="h-3 w-3" />
      ) : (
        <Sun className="h-3 w-3 text-amber-500" />
      )}
    </span>
  </button>
</div>
```

- [ ] **Step 2: Update the theme swatch grid to show only light variants**

Replace the current theme grid (which maps `THEME_OPTIONS`) with one that maps `THEME_CARDS` (light-only swatches):

```tsx
<div className="grid grid-cols-2 gap-2">
  {THEME_CARDS.map((opt) => (
    <button
      key={opt.id}
      type="button"
      onClick={() => {
        const target = theme.endsWith("-dark")
          ? (opt.id + "-dark") as typeof theme
          : opt.id;
        setTheme(target);
      }}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-all",
        theme === opt.id || theme === (opt.id + "-dark")
          ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent-muted)]"
          : "border-[var(--color-border)] hover:border-[var(--color-text-muted)]"
      )}
      aria-label={`${opt.family} theme`}
      aria-pressed={theme === opt.id || theme === (opt.id + "-dark")}
    >
      <div className="flex flex-col gap-1.
">
        <span className="text-xs font-medium">{opt.family}</span>
        <div className="flex gap-1">
          {opt.swatches.map((color) => (
            <div
              key={color}
              className="h-3 w-3 rounded-full border border-[var(--color-border)]"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </button>
  ))}
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/PreferencesModal.tsx
git commit -m "feat: add dark mode toggle to preferences modal with family-based theme selection"
```

---

### Task 6: Update PreferencesProvider for dark mode awareness

**Files:**
- Modify: `src/components/PreferencesProvider.tsx`

- [ ] **Step 1: Update the provider to handle dark themes correctly**

Read `src/components/PreferencesProvider.tsx` first. The current code removes all `theme-*` classes and adds the new one. This already works with the new theme names since they follow the same `theme-{name}` pattern. No changes needed — the provider already correctly strips old classes and adds new ones.

- [ ] **Step 2: Verify by running the dev server**

```bash
npm run dev
```

Open browser, open PreferencesModal, toggle dark mode. Verify:
- Theme class on `<html>` changes between `theme-notion` and `theme-notion-dark`
- Background switches between light (#f7f7f5) and dark (#1a1a1f)
- Refresh page — no white flash on dark mode load

- [ ] **Step 3: Commit**

```bash
git add src/components/PreferencesProvider.tsx
git commit -m "chore: verify PreferencesProvider works with dark theme classes"
```

---

### Task 7: Store migration — handle old persisted "dark"/"midnight" values

**Files:**
- Modify: `src/store/usePreferencesStore.ts`

- [ ] **Step 1: Verify migration logic already handles legacy values**

Read `src/store/usePreferencesStore.ts`. The store already calls `normalizeTheme()` on every load, which maps `"dark"` and `"midnight"` to `"notion-dark"` (updated in Task 2). No additional store migration needed.

- [ ] **Step 2: Commit**

```bash
git add src/store/usePreferencesStore.ts
git commit -m "chore: verify preferences store migration handles legacy dark/midnight values"
```

---

### Task 8: Phase 1 integration test

- [ ] **Step 1: Run all tests**

```bash
npx vitest --run
```

- [ ] **Step 2: Manual verification checklist**
  - [ ] 9 light themes render correct colors
  - [ ] 9 dark themes render correct colors
  - [ ] Toggle switches between light/dark of same family
  - [ ] Page load in dark mode shows no flash of light
  - [ ] Page load in light mode shows no flash of dark
  - [ ] Font changes persist across theme toggle
  - [ ] `prefers-reduced-motion: reduce` disables transitions
  - [ ] All 18 theme classes set correct `color-scheme`

- [ ] **Step 3: Commit checkpoint**

```bash
git add -A
git commit -m "chore: Phase 1 complete — token system + 18 themes + dark mode toggle"
```

---

## Phase 2: Component Token Migration + i18n

### Task 9: Install and configure next-intl

**Files:**
- Create: `src/lib/i18n.ts`
- Create: `src/lib/i18n-client.ts`
- Create: `src/messages/en.json`
- Create: `src/messages/vi.json`

- [ ] **Step 1: Install dependencies**

```bash
npm install next-intl
```

- [ ] **Step 2: Create server-side i18n config**

Write `src/lib/i18n.ts`:

```ts
import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./i18n-client";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 3: Create client-side i18n config**

Write `src/lib/i18n-client.ts`:

```ts
import { createNavigation } from "next-intl/navigation";
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "vi"],
  defaultLocale: "en",
});

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
```

- [ ] **Step 4: Create English messages**

Write `src/messages/en.json`:

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "close": "Close",
    "loading": "Loading...",
    "saveChanges": "Save changes",
    "saved": "Saved",
    "saving": "Saving..."
  },
  "auth": {
    "email": "Email address",
    "password": "Password",
    "name": "Full name",
    "login": "Log in",
    "loginAction": "Log in",
    "register": "Create account",
    "registerAction": "Create account",
    "noAccount": "Don't have an account?",
    "hasAccount": "Already have an account?",
    "signUp": "Sign up",
    "signIn": "Sign in",
    "logout": "Sign out",
    "dob": "Date of birth",
    "changePassword": "Change password",
    "currentPassword": "Current password",
    "newPassword": "New password",
    "confirmPassword": "Confirm new password",
    "profileImage": "Profile image",
    "browse": "Browse..."
  },
  "nav": {
    "dashboard": "Home",
    "projects": "My Workspaces",
    "people": "People",
    "friends": "Friends",
    "settings": "Preferences"
  },
  "project": {
    "new": "New workspace",
    "createFirst": "Create your first workspace and start writing with context-aware AI.",
    "startNew": "Start a new story",
    "noProjects": "No workspaces yet",
    "recent": "Recent",
    "publicProjects": "Public workspaces",
    "private": "Private",
    "public": "Public",
    "collaborators": "Collaborators",
    "invite": "Invite",
    "manageCollaborators": "Manage collaborators"
  },
  "editor": {
    "ai": {
      "write": "Write",
      "rewrite": "Rewrite",
      "describe": "Describe",
      "brainstorm": "Brainstorm",
      "writeShortcut": "Write (⌘⇧W)",
      "rewriteShortcut": "Rewrite (⌘⇧R)",
      "describeShortcut": "Describe (⌘⇧D)",
      "brainstormShortcut": "Brainstorm (⌘⇧B)"
    },
    "toolbar": {
      "bold": "Bold",
      "italic": "Italic",
      "underline": "Underline",
      "heading": "Heading"
    },
    "status": {
      "saved": "Saved",
      "saving": "Saving...",
      "unsaved": "Unsaved changes"
    },
    "placeholder": "Start writing...",
    "wordCount": "{count} words"
  },
  "sidebar": {
    "chapters": "Chapters",
    "addChapter": "Add chapter",
    "deleteChapter": "Delete chapter",
    "storyBible": "Story Bible",
    "versionHistory": "Version History"
  },
  "zen": {
    "enter": "Enter zen mode",
    "exit": "Exit zen mode",
    "toolbarHint": "Move cursor to the top to show the toolbar"
  },
  "command": {
    "placeholder": "Type a command or search...",
    "noResults": "No results found",
    "navigation": "Navigation",
    "chapters": "Chapters",
    "aiActions": "AI Actions",
    "settings": "Settings",
    "projects": "Projects",
    "goToDashboard": "Go to Dashboard",
    "toggleTheme": "Toggle dark mode",
    "toggleFont": "Change font",
    "toggleZen": "Toggle zen mode",
    "generateChapter": "Generate new chapter",
    "rewriteSelection": "Rewrite selection",
    "describeSelection": "Describe selection",
    "brainstormIdeas": "Brainstorm ideas"
  },
  "a11y": {
    "skipToContent": "Skip to content"
  },
  "voiceReader": {
    "play": "Play",
    "pause": "Pause",
    "stop": "Stop",
    "speed": "Speed",
    "voice": "Voice"
  }
}
```

- [ ] **Step 5: Create Vietnamese messages placeholder**

Write `src/messages/vi.json`:

```json
{
  "common": {
    "save": "Lưu",
    "cancel": "Hủy",
    "delete": "Xóa",
    "close": "Đóng",
    "loading": "Đang tải...",
    "saveChanges": "Lưu thay đổi",
    "saved": "Đã lưu",
    "saving": "Đang lưu..."
  },
  "auth": {
    "email": "Địa chỉ email",
    "password": "Mật khẩu",
    "name": "Họ và tên",
    "login": "Đăng nhập",
    "loginAction": "Đăng nhập",
    "register": "Tạo tài khoản",
    "registerAction": "Tạo tài khoản",
    "noAccount": "Chưa có tài khoản?",
    "hasAccount": "Đã có tài khoản?",
    "signUp": "Đăng ký",
    "signIn": "Đăng nhập",
    "logout": "Đăng xuất",
    "dob": "Ngày sinh",
    "changePassword": "Đổi mật khẩu",
    "currentPassword": "Mật khẩu hiện tại",
    "newPassword": "Mật khẩu mới",
    "confirmPassword": "Xác nhận mật khẩu mới",
    "profileImage": "Ảnh đại diện",
    "browse": "Duyệt..."
  },
  "project": {
    "new": "Tạo workspace mới",
    "startNew": "Bắt đầu câu chuyện mới",
    "noProjects": "Chưa có workspace nào"
  },
  "editor": {
    "ai": {
      "write": "Viết",
      "rewrite": "Viết lại",
      "describe": "Mô tả",
      "brainstorm": "Lên ý tưởng"
    },
    "toolbar": {
      "bold": "In đậm",
      "italic": "In nghiêng",
      "underline": "Gạch chân",
      "heading": "Tiêu đề"
    },
    "placeholder": "Bắt đầu viết...",
    "wordCount": "{count} từ"
  },
  "sidebar": {
    "chapters": "Chương",
    "addChapter": "Thêm chương",
    "deleteChapter": "Xóa chương",
    "storyBible": "Story Bible",
    "versionHistory": "Lịch sử phiên bản"
  },
  "zen": {
    "enter": "Vào chế độ tập trung",
    "exit": "Thoát chế độ tập trung"
  },
  "command": {
    "placeholder": "Nhập lệnh hoặc tìm kiếm...",
    "noResults": "Không tìm thấy kết quả",
    "navigation": "Điều hướng",
    "chapters": "Chương",
    "aiActions": "Hành động AI",
    "settings": "Cài đặt",
    "projects": "Dự án",
    "goToDashboard": "Đi đến Bảng điều khiển",
    "toggleTheme": "Chuyển đổi giao diện",
    "toggleFont": "Đổi phông chữ",
    "toggleZen": "Chế độ tập trung",
    "generateChapter": "Tạo chương mới",
    "rewriteSelection": "Viết lại đoạn đã chọn",
    "describeSelection": "Mô tả đoạn đã chọn",
    "brainstormIdeas": "Lên ý tưởng"
  },
  "a11y": {
    "skipToContent": "Bỏ qua đến nội dung"
  },
  "voiceReader": {
    "play": "Phát",
    "pause": "Tạm dừng",
    "stop": "Dừng",
    "speed": "Tốc độ",
    "voice": "Giọng đọc"
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n.ts src/lib/i18n-client.ts src/messages/
npm install next-intl
git add package.json package-lock.json
git commit -m "feat: set up next-intl with English and Vietnamese message files"
```

---

### Task 10: Restructure app routes for locale

**Files:**
- Create: `src/app/[locale]/layout.tsx`
- Create: `src/middleware.ts`
- Move: All existing pages under `src/app/[locale]/`
- Modify: `next.config.ts`

- [ ] **Step 1: Create middleware**

Write `src/middleware.ts`:

```ts
import createMiddleware from "next-intl/middleware";
import { routing } from "@/lib/i18n-client";

export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
```

- [ ] **Step 2: Create [locale] layout**

Write `src/app/[locale]/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/lib/i18n-client";

import { PreferencesProvider } from "@/components/PreferencesProvider";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Contextra",
  description: "AI-powered collaborative writing workspace",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <head>
        <meta name="theme-color" content="#f7f7f5" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <PreferencesProvider>{children}</PreferencesProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Move existing pages to [locale] directory**

```bash
mkdir -p src/app/\[locale\]/login src/app/\[locale\]/register src/app/\[locale\]/project/\[id\]
# Move page files
# Content will be moved in subsequent per-component tasks
```

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts src/app/\[locale\]/
git commit -m "feat: restructure app router for locale-based routing with next-intl"
```

---

### Task 11: Migrate LoginView — tokens + i18n + visible labels

**Files:**
- Modify: `src/components/LoginView.tsx`

- [ ] **Step 1: Read the current file and rewrite with tokens + i18n + visible labels**

Read `src/components/LoginView.tsx` first. Replace the entire file:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/actions/auth";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n-client";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function LoginView() {
  const t = useTranslations("auth");
  const ct = useTranslations("common");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{t("login")}</h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-[var(--color-surface)] p-8 shadow-sm border border-[var(--color-border)]"
        >
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-6 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400"
            >
              {error}
            </div>
          )}

          <div className="space-y-5">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-[var(--color-text-secondary)]">
                {t("email")}
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className={cn(
                  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2",
                  "text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]",
                  "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                )}
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-[var(--color-text-secondary)]">
                {t("password")}
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className={cn(
                  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2",
                  "text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]",
                  "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                )}
              />
            </label>

            <button
              type="submit"
              disabled={pending}
              className={cn(
                "w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors",
                "bg-[var(--color-accent)] hover:opacity-90",
                "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2",
                pending && "opacity-60 cursor-not-allowed"
              )}
            >
              {pending ? ct("loading") : t("loginAction")}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-[var(--color-text-secondary)]">
            {t("noAccount")}{" "}
            <Link href="/register" className="font-medium text-[var(--color-accent)] hover:underline">
              {t("signUp")}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/LoginView.tsx
git commit -m "feat: migrate LoginView to design tokens, i18n, and visible form labels"
```

---

### Task 12: Migrate RegisterView — tokens + i18n + visible labels

**Files:**
- Modify: `src/components/RegisterView.tsx`

- [ ] **Step 1: Same pattern as LoginView — rewrite with tokens, i18n, labels**

Read `src/components/RegisterView.tsx` first, then apply the same pattern as Task 11 with name, email, password fields using `t("name")`, `t("email")`, `t("password")`, and a Link to login.

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/RegisterView.tsx
git commit -m "feat: migrate RegisterView to design tokens, i18n, and visible form labels"
```

---

### Task 13: Migrate PreferencesModal — tokens + i18n

**Files:**
- Modify: `src/components/PreferencesModal.tsx`

- [ ] **Step 1: Replace hardcoded text with t() calls, replace hardcoded colors with tokens**

Read `src/components/PreferencesModal.tsx` first. Apply:
- All `text-slate-*` → `text-[var(--color-text-secondary)]` or `text-[var(--color-text)]`
- All `bg-white` → `bg-[var(--color-surface)]`
- All `border-slate-*` → `border-[var(--color-border)]`
- All button/label text → `t("common.save")`, etc.
- Tab labels → `t("nav.settings")` equivalent keys
- Remove the non-functional profile image "Browse..." button

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/PreferencesModal.tsx
git commit -m "feat: migrate PreferencesModal to design tokens, i18n, and remove dead profile upload"
```

---

### Task 14: Migrate DashboardView — tokens + i18n

**Files:**
- Modify: `src/components/DashboardView.tsx`

- [ ] **Step 1: Replace hardcoded colors with tokens, hardcoded text with t()**

Read `src/components/DashboardView.tsx` first. Key changes:
- `bg-[#f7f7f5]` → `bg-[var(--color-canvas)]`
- `bg-white` → `bg-[var(--color-surface)]`
- `text-slate-500` → `text-[var(--color-text-secondary)]`
- `text-slate-900` → `text-[var(--color-text)]`
- `border-slate-200` → `border-[var(--color-border)]`
- `text-slate-300` (dates) → `text-[var(--color-text-muted)]`
- "Create your first workspace" → conditional: `t("project.createFirst")` for empty, `t("project.startNew")` when projects exist
- Navigation labels → t() calls

- [ ] **Step 2: Commit**

```bash
git add src/components/DashboardView.tsx
git commit -m "feat: migrate DashboardView to design tokens, i18n, and conditional new-project copy"
```

---

### Task 15: Migrate ProjectWorkspace — tokens + i18n

**Files:**
- Modify: `src/components/ProjectWorkspace.tsx`

- [ ] **Step 1: Replace hardcoded colors with tokens**

Read `src/components/ProjectWorkspace.tsx` first. Key changes:
- `bg-[#f7f7f5]` → `bg-[var(--color-canvas)]`
- `bg-white` → `bg-[var(--color-surface)]`
- All `text-slate-*` → appropriate `--color-text*` tokens
- All `border-slate-*` → `--color-border`
- Remove the more-horizontal "Coming soon" button at line 318

- [ ] **Step 2: Commit**

```bash
git add src/components/ProjectWorkspace.tsx
git commit -m "feat: migrate ProjectWorkspace to design tokens, remove coming-soon button"
```

---

### Task 16: Migrate MainEditor — tokens + i18n

**Files:**
- Modify: `src/components/MainEditor.tsx`

- [ ] **Step 1: Replace hardcoded colors and extract AI button strings**

Read `src/components/MainEditor.tsx` first. Key changes:
- All hardcoded Tailwind colors → token variables
- AI button labels (Write/Rewrite/Describe/Brainstorm) → `t("editor.ai.write")` etc.
- Save status text → `t("editor.status.saved")` etc.
- Remove `ChevronDown` icons from AI buttons (lines ~1160-1180 area)
- Wrap AI buttons in Radix `<Tooltip>` showing shortcuts

```tsx
import { Tooltip } from "@radix-ui/react-tooltip";

// Tooltip wrapper
<Tooltip>
  <Tooltip.Trigger asChild>
    <button ...>
      <Wand2 className="size-4" />
      <span>{t("editor.ai.write")}</span>
    </button>
  </Tooltip.Trigger>
  <Tooltip.Portal>
    <Tooltip.Content
      className="rounded-lg bg-[var(--color-text)] px-3 py-2 text-xs text-[var(--color-canvas)] shadow-lg"
      sideOffset={5}
    >
      {t("editor.ai.writeShortcut")}
      <Tooltip.Arrow className="fill-[var(--color-text)]" />
    </Tooltip.Content>
  </Tooltip.Portal>
</Tooltip>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MainEditor.tsx
git commit -m "feat: migrate MainEditor to design tokens, i18n, Radix tooltips, remove ChevronDown"
```

---

### Task 17: Migrate AiCardsPane, SidebarNavigator, StoryBibleView — tokens

**Files:**
- Modify: `src/components/AiCardsPane.tsx`
- Modify: `src/components/SidebarNavigator.tsx`
- Modify: `src/components/StoryBibleView.tsx`

- [ ] **Step 1: Replace hardcoded colors with tokens in all 3 files**

Read each file first. Apply the same token migration pattern. Remove dead buttons from AiCardsPane (Upgrade, Support at lines 323-329; ThumbsUp/Down/Star at lines 243-245).

- [ ] **Step 2: Commit**

```bash
git add src/components/AiCardsPane.tsx src/components/SidebarNavigator.tsx src/components/StoryBibleView.tsx
git commit -m "feat: migrate AiCardsPane, SidebarNavigator, StoryBibleView to design tokens; remove dead buttons"
```

---

### Task 18: Migrate remaining components — tokens + i18n

**Files:**
- Modify: `src/components/CollaborationPanel.tsx`
- Modify: `src/components/VersionHistoryPanel.tsx`
- Modify: `src/components/AllProjectsModal.tsx`
- Modify: `src/components/CreateProjectModal.tsx`
- Modify: `src/components/PeopleView.tsx`
- Modify: `src/components/FriendsView.tsx`
- Modify: `src/components/LandingView.tsx`
- Modify: `src/components/PublicVoiceReader.tsx`

- [ ] **Step 1: Replace hardcoded colors with tokens in all remaining components**

For each file, read first, then apply token migration. Map each hardcoded color to the appropriate semantic token.

- [ ] **Step 2: Commit**

```bash
git add src/components/
git commit -m "feat: migrate all remaining components to design tokens"
```

---

### Task 19: Global contrast sweep — verify no hardcoded colors remain

**Files:**
- Search all: `src/`

- [ ] **Step 1: Search for remaining hardcoded color classes**

```bash
rg "bg-white|bg-\[#|bg-slate-|bg-gray-|text-slate-|text-gray-|border-slate-|border-gray-" src/components/ --count
```

Expected: 0 matches in components (some may remain in services/actions which don't render UI).

- [ ] **Step 2: Fix any remaining violations**

If any color classes remain in components, replace them with the appropriate token.

- [ ] **Step 3: Commit**

```bash
git add src/components/
git commit -m "fix: remove all remaining hardcoded color classes from components"
```

---

### Task 20: Phase 2 integration test

- [ ] **Step 1: Run typecheck and tests**

```bash
npx tsc --noEmit && npx vitest --run
```

- [ ] **Step 2: Manual verification checklist**
  - [ ] Login page renders with visible labels in both light and dark
  - [ ] Register page renders correctly in both modes
  - [ ] Dashboard shows correct token colors and i18n text
  - [ ] Project workspace renders all panels correctly in both modes
  - [ ] Editor toolbar shows tooltips on hover
  - [ ] No ChevronDown icons on AI buttons
  - [ ] No dead "Coming soon" buttons visible
  - [ ] All 18 theme + mode combinations render correctly
  - [ ] `/vi` routes display Vietnamese text
  - [ ] `/en` routes display English text
  - [ ] No white/dark flash on load in either mode

- [ ] **Step 3: Commit checkpoint**

```bash
git add -A
git commit -m "chore: Phase 2 complete — component token migration + i18n"
```

---

## Phase 3: Accessibility + Polish

### Task 21: Wrap PreferencesModal in Radix Dialog

**Files:**
- Modify: `src/components/PreferencesModal.tsx`

- [ ] **Step 1: Replace the raw div overlay with Radix Dialog.Root**

Read `src/components/PreferencesModal.tsx` first. Wrap the entire modal in:

```tsx
import * as Dialog from "@radix-ui/react-dialog";

export function PreferencesModal({ onClose, user }: PreferencesModalProps) {
  // ... existing state ...

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed inset-4 z-50 mx-auto max-w-3xl overflow-hidden rounded-2xl
            bg-[var(--color-surface)] shadow-2xl flex flex-col md:inset-10
            focus:outline-none"
        >
          <Dialog.Title className="sr-only">{t("nav.settings")}</Dialog.Title>
          {/* ... existing modal content ... */}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: Add responsive tab layout for mobile**

Replace the existing sidebar + content layout with:

```tsx
<div className="flex flex-col md:flex-row h-full">
  {/* Tabs — horizontal on mobile, vertical on desktop */}
  <div className="flex flex-row md:flex-col shrink-0 gap-1 px-4 py-3 md:px-3 md:py-4
    border-b md:border-b-0 md:border-r border-[var(--color-border)] overflow-x-auto">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        onClick={() => setActiveTab(tab.id)}
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap",
          activeTab === tab.id
            ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
        )}
      >
        <tab.icon className="size-4" />
        <span className="hidden md:inline">{tab.label}</span>
      </button>
    ))}
  </div>
  <div className="flex-1 overflow-y-auto p-4 md:p-6">
    {/* tab content */}
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/PreferencesModal.tsx
git commit -m "fix: wrap PreferencesModal in Radix Dialog for focus trap, mobile-responsive tabs"
```

---

### Task 22: Add skip-to-content link

**Files:**
- Modify: `src/app/[locale]/layout.tsx`

- [ ] **Step 1: Add skip link to layout**

In the locale layout, add inside `<body>` before the provider:

```tsx
<body className="antialiased">
  <a
    href="#main-content"
    className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4
      focus:z-[100] focus:rounded-xl focus:px-4 focus:py-2 focus:text-sm focus:font-medium
      focus:bg-[var(--color-text)] focus:text-[var(--color-canvas)] focus:shadow-lg
      focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
  >
    Skip to content
  </a>
  <NextIntlClientProvider locale={locale} messages={messages}>
    <PreferencesProvider>
      <main id="main-content">{children}</main>
    </PreferencesProvider>
  </NextIntlClientProvider>
</body>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\[locale\]/layout.tsx
git commit -m "fix: add skip-to-content link for WCAG 2.4.1 Bypass Blocks"
```

---

### Task 23: Add nav aria-labels to sidebar

**Files:**
- Modify: `src/components/ProjectWorkspace.tsx`

- [ ] **Step 1: Add aria-label to sidebar nav region**

Read `src/components/ProjectWorkspace.tsx` first. Find the `<SidebarNavigator />` wrapper and add:

```tsx
<nav aria-label="Project navigation">
  <SidebarNavigator project={project} ... />
</nav>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ProjectWorkspace.tsx
git commit -m "fix: add nav aria-label to project sidebar for screen readers"
```

---

### Task 24: Fix "Create your first workspace" copy conditionally

**Files:**
- Modify: `src/components/DashboardView.tsx`

- [ ] **Step 1: Show conditional copy based on existing projects**

Read `src/components/DashboardView.tsx` first. Find the "Create your first workspace" text (around line 305). Replace with:

```tsx
const t = useTranslations("project");

// In the empty state/new project card area:
<span className="...">
  {hasExistingProjects ? t("startNew") : t("createFirst")}
</span>
```

Where `hasExistingProjects` is `projects.length > 0` (already available from the component's data).

- [ ] **Step 2: Commit**

```bash
git add src/components/DashboardView.tsx
git commit -m "fix: show conditional new-project copy based on whether projects exist"
```

---

### Task 25: Extract LoadingState component

**Files:**
- Create: `src/components/LoadingState.tsx`
- Modify: `src/components/ProjectWorkspace.tsx` (replace loading components)
- Modify: `src/components/DashboardView.tsx` (replace loading components)

- [ ] **Step 1: Create the LoadingState component**

Write `src/components/LoadingState.tsx`:

```tsx
"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface LoadingStateProps {
  variant?: "inline" | "overlay" | "fullscreen";
  message?: string;
}

export function LoadingState({ variant = "inline", message }: LoadingStateProps) {
  const t = useTranslations("common");

  return (
    <div
      className={cn(
        "flex items-center justify-center",
        variant === "inline" && "py-8",
        variant === "overlay" && "absolute inset-0 bg-[var(--color-canvas)]/80 backdrop-blur-sm z-10",
        variant === "fullscreen" && "min-h-screen"
      )}
      role="status"
      aria-busy="true"
      aria-label={message ?? t("loading")}
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="size-6 animate-spin text-[var(--color-text-muted)]" />
        {message && (
          <p className="text-sm text-[var(--color-text-muted)]">{message}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace existing loading components**

In `ProjectWorkspace.tsx`, replace `WorkspaceCanvasLoading` and `WorkspaceSidePanelLoading` with `<LoadingState variant="overlay" />` or `<LoadingState variant="inline" />` as appropriate.

In `DashboardView.tsx`, replace `DashboardSurfaceLoading` and `DashboardModalLoading` with `<LoadingState variant="fullscreen" />` or `<LoadingState variant="inline" />`.

- [ ] **Step 3: Commit**

```bash
git add src/components/LoadingState.tsx src/components/ProjectWorkspace.tsx src/components/DashboardView.tsx
git commit -m "refactor: extract LoadingState component, replace 4 duplicate loading patterns"
```

---

### Task 26: Remove bubble menu Expand button

**Files:**
- Modify: `src/components/MainEditor.tsx`

- [ ] **Step 1: Remove the Expand icon button from the BubbleMenu**

Read `src/components/MainEditor.tsx` first. Find the `Expand` icon button in the BubbleMenu (around line 1359). Remove the entire button element.

- [ ] **Step 2: Commit**

```bash
git add src/components/MainEditor.tsx
git commit -m "fix: remove non-functional Expand button from editor BubbleMenu"
```

---

### Task 27: Phase 3 integration test

- [ ] **Step 1: Run typecheck and tests**

```bash
npx tsc --noEmit && npx vitest --run
```

- [ ] **Step 2: Manual verification checklist**
  - [ ] PreferencesModal has focus trap (Tab cycles within modal)
  - [ ] Escape closes PreferencesModal
  - [ ] PreferencesModal tabs are horizontal scrollable on mobile viewport
  - [ ] Tab key shows skip-to-content link on first focus
  - [ ] Screen reader announces sidebar as "Project navigation"
  - [ ] "Start a new story" shown when user has existing projects
  - [ ] "Create your first workspace" shown for new users
  - [ ] Loading states use consistent LoadingState component
  - [ ] No Expand button in editor BubbleMenu
  - [ ] No dead button placeholders in AI pane

- [ ] **Step 3: Commit checkpoint**

```bash
git add -A
git commit -m "chore: Phase 3 complete — accessibility fixes, polish, dead code removal"
```

---

## Phase 4: Zen Mode + Command Palette

### Task 28: Create useZenStore

**Files:**
- Create: `src/store/useZenStore.ts`

- [ ] **Step 1: Create the zen mode Zustand store**

Write `src/store/useZenStore.ts`:

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/store/useZenStore.ts
git commit -m "feat: add zen mode Zustand store"
```

---

### Task 29: Implement zen mode in ProjectWorkspace

**Files:**
- Modify: `src/components/ProjectWorkspace.tsx`

- [ ] **Step 1: Add zen mode layout logic**

Read `src/components/ProjectWorkspace.tsx` first. Add zen mode behavior:

```tsx
import { cn } from "@/lib/utils";
import { useZenStore } from "@/store/useZenStore";
import { useEffect, useRef, useState, useCallback } from "react";

export function ProjectWorkspace({ project }: { project: Project }) {
  const { isZenMode, exitZen } = useZenStore();
  const [showChrome, setShowChrome] = useState(false);
  const chromeTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isZenMode) return;
    setShowChrome(true);
    clearTimeout(chromeTimer.current);
    chromeTimer.current = setTimeout(() => setShowChrome(false), 3000);
  }, [isZenMode]);

  useEffect(() => {
    if (!isZenMode) {
      setShowChrome(true);
      return;
    }
    setShowChrome(false);
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      clearTimeout(chromeTimer.current);
    };
  }, [isZenMode, handleMouseMove]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isZenMode) {
        exitZen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isZenMode, exitZen]);

  return (
    <div className={cn("flex h-screen w-full overflow-hidden", isZenMode && "bg-[var(--color-canvas)]")}>
      {/* Sidebar — hide in zen */}
      {!isZenMode && (<nav aria-label="Project navigation"><SidebarNavigator /></nav>)}

      {/* Main area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar — hide in zen, show on mouse move */}
        <div className={cn(
          "transition-all duration-500",
          isZenMode && !showChrome && "opacity-0 pointer-events-none -translate-y-full",
          isZenMode && showChrome && "opacity-100"
        )}>
          {/* existing top bar */}
        </div>

        {/* Editor — center in zen */}
        <div className={cn(
          "flex-1 overflow-hidden transition-all duration-500",
          isZenMode && "max-w-2xl mx-auto w-full"
        )}>
          {/* existing editor */}
        </div>
      </main>

      {/* Right panels — hide in zen */}
      {!isZenMode && (
        <>
          {/* AI pane, version history, collaboration panels */}
        </>
      )}

      {/* Zen exit button */}
      {isZenMode && showChrome && (
        <button
          onClick={exitZen}
          className="fixed bottom-6 right-6 z-50 rounded-full bg-[var(--color-surface)] px-4 py-2
            text-sm font-medium text-[var(--color-text-secondary)] shadow-lg border border-[var(--color-border)]
            hover:text-[var(--color-text)] transition-all"
          aria-label="Exit zen mode"
        >
          {t("zen.exit")}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ProjectWorkspace.tsx
git commit -m "feat: implement zen mode with fading chrome, auto-show on mouse move"
```

---

### Task 30: Connect Maximize2 button to zen mode

**Files:**
- Modify: `src/components/MainEditor.tsx`

- [ ] **Step 1: Wire the Maximize2 button to toggle zen mode**

Read `src/components/MainEditor.tsx` first. Find the Maximize2 button (around line 1287). Replace its onClick:

```tsx
import { useZenStore } from "@/store/useZenStore";
import { useTranslations } from "next-intl";

// Inside MainEditor:
const { toggleZen } = useZenStore();
const t = useTranslations("zen");

// The Maximize2 button:
<button
  onClick={toggleZen}
  className="..."
  aria-label={t("enter")}
  title={t("enter")}
>
  <Maximize2 className="size-4" />
</button>
```

- [ ] **Step 2: Add keyboard shortcut for zen toggle**

In `ProjectWorkspace.tsx`, add:

```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
      e.preventDefault();
      toggleZen();
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, [toggleZen]);
```

- [ ] **Step 3: Commit**

```bash
git add src/components/MainEditor.tsx src/components/ProjectWorkspace.tsx
git commit -m "feat: wire Maximize2 button to zen mode with Cmd+Shift+F shortcut"
```

---

### Task 31: Create CommandPalette component

**Files:**
- Create: `src/components/CommandPalette.tsx`

- [ ] **Step 1: Create the command palette component**

Write `src/components/CommandPalette.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/store/usePreferencesStore";
import { useZenStore } from "@/store/useZenStore";
import { toggleThemeDark } from "@/lib/appearance";
import {
  Search, FileText, Wand2, Settings, Sun, Moon,
  Maximize2, Minimize2, Home, BookOpen,
} from "lucide-react";

interface CommandItem {
  id: string;
  group: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  chapters: { id: string; title: string }[];
}

export function CommandPalette({ chapters }: CommandPaletteProps) {
  const t = useTranslations("command");
  const router = useRouter();
  const { theme, setTheme } = usePreferencesStore();
  const { isZenMode, toggleZen } = useZenStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
        setSelectedIndex(0);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const allCommands: CommandItem[] = useMemo(() => [
    { id: "dashboard", group: t("navigation"), label: t("goToDashboard"), icon: <Home className="size-4" />,
      action: () => { router.push("/"); setOpen(false); } },
    { id: "theme", group: t("settings"), label: t("toggleTheme"), icon: theme.endsWith("-dark") ? <Sun className="size-4" /> : <Moon className="size-4" />,
      action: () => { setTheme(toggleThemeDark(theme)); setOpen(false); } },
    { id: "zen", group: t("settings"), label: t("toggleZen"), icon: isZenMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />,
      action: () => { toggleZen(); setOpen(false); } },
    ...chapters.map((ch) => ({
      id: `chapter-${ch.id}`,
      group: t("chapters"),
      label: ch.title || "Untitled Chapter",
      icon: <FileText className="size-4" />,
      action: () => { setOpen(false); },
    })),
  ], [t, router, theme, setTheme, isZenMode, toggleZen, chapters]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allCommands;
    const q = query.toLowerCase();
    return allCommands.filter((cmd) => cmd.label.toLowerCase().includes(q));
  }, [allCommands, query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].action();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, selectedIndex]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <Search className="size-5 text-[var(--color-text-muted)] shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("placeholder")}
            className="flex-1 bg-transparent text-sm text-[var(--color-text)] outline-none
              placeholder:text-[var(--color-text-muted)]"
          />
          <kbd className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-1.5 py-0.5
            text-xs text-[var(--color-text-muted)] font-mono">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
              {t("noResults")}
            </p>
          ) : (
            <Groups commands={filtered} selectedIndex={selectedIndex} />
          )}
        </div>
      </div>
    </div>
  );

  function Groups({ commands, selectedIndex }: { commands: CommandItem[]; selectedIndex: number }) {
    const groups = new Map<string, CommandItem[]>();
    commands.forEach((cmd) => {
      const g = groups.get(cmd.group) || [];
      g.push(cmd);
      groups.set(cmd.group, g);
    });

    let i = 0;
    return Array.from(groups.entries()).map(([group, cmds]) => (
      <div key={group} className="mb-1">
        <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          {group}
        </p>
        {cmds.map((cmd) => {
          const idx = i++;
          return (
            <button
              key={cmd.id}
              onClick={cmd.action}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                idx === selectedIndex
                  ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
                  : "text-[var(--color-text)] hover:bg-[var(--color-surface-alt)]"
              )}
            >
              <span className="shrink-0">{cmd.icon}</span>
              <span className="flex-1 text-left">{cmd.label}</span>
              {cmd.shortcut && (
                <kbd className="text-xs text-[var(--color-text-muted)]">{cmd.shortcut}</kbd>
              )}
            </button>
          );
        })}
      </div>
    ));
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CommandPalette.tsx
git commit -m "feat: add command palette with Cmd+K trigger, grouped search results"
```

---

### Task 32: Mount CommandPalette in ProjectWorkspace

**Files:**
- Modify: `src/components/ProjectWorkspace.tsx`

- [ ] **Step 1: Import and mount CommandPalette**

Add to `ProjectWorkspace.tsx`:

```tsx
import { CommandPalette } from "@/components/CommandPalette";

// In the JSX, as a sibling to the main layout:
<CommandPalette chapters={project.chapters.map(ch => ({ id: ch.id, title: ch.title }))} />
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ProjectWorkspace.tsx
git commit -m "feat: mount CommandPalette in ProjectWorkspace with chapter list"
```

---

### Task 33: Add page transition and micro-interactions

**Files:**
- Modify: `src/app/[locale]/layout.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add page fade-in animation**

In `globals.css`, add:

```css
@keyframes page-enter {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

main {
  animation: page-enter 0.2s ease-out;
}
```

- [ ] **Step 2: Add save indicator pulse-checkmark animation**

In `globals.css`, add:

```css
@keyframes save-pulse {
  0%   { opacity: 1; transform: scale(1); }
  50%  { opacity: 0.6; transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}

.save-indicator-saving {
  animation: save-pulse 0.6s ease-in-out infinite;
}
```

- [ ] **Step 3: Add staggered sidebar chapter list animation**

In `globals.css`, add:

```css
.sidebar-chapter-enter {
  animation: page-enter 0.2s ease-out both;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/\[locale\]/layout.tsx
git commit -m "feat: add page transitions, save pulse animation, sidebar stagger animations"
```

---

### Task 34: Phase 4 integration test

- [ ] **Step 1: Manual verification**
  - [ ] Maximize2 button enters zen mode
  - [ ] Sidebar, toolbar, right panels hide in zen mode
  - [ ] Editor centers with max-w-2xl in zen mode
  - [ ] Mouse movement shows chrome (auto-hides after 3s)
  - [ ] Escape exits zen mode
  - [ ] Cmd+K opens command palette
  - [ ] Typing filters commands by group
  - [ ] Arrow keys + Enter navigate and execute
  - [ ] "Toggle dark mode" command works
  - [ ] "Toggle zen mode" command works
  - [ ] Page transitions feel smooth (no jarring)
  - [ ] `prefers-reduced-motion` disables all animations

- [ ] **Step 2: Commit checkpoint**

```bash
git add -A
git commit -m "chore: Phase 4 complete — zen mode + command palette + motion"
```

---

## Phase 5: Performance + Landing Page

### Task 35: Lazy-load non-active fonts

**Files:**
- Modify: `src/app/[locale]/layout.tsx`

- [ ] **Step 1: Replace unconditional font preloads with conditional**

Read the current `layout.tsx` where all 8 fonts are imported. Keep the font CSS imports (needed for font-switching at runtime) but remove explicit `<link rel="preload">` tags. The browser will only download the active font CSS.

Instead, add a `media` query to font stylesheet `<link>` tags if present:

```tsx
// Remove any <link rel="preload" href="...font.woff2" /> tags
// Keep <link rel="stylesheet" href="...font.css" /> for all fonts
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\[locale\]/layout.tsx
git commit -m "perf: remove unconditional font preloads, rely on CSS font-display"
```

---

### Task 36: Dynamic import MainEditor and StoryBibleView

**Files:**
- Modify: `src/components/ProjectWorkspace.tsx`

- [ ] **Step 1: Convert to dynamic imports with loading fallbacks**

Read `src/components/ProjectWorkspace.tsx` first. Replace static imports:

```tsx
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/LoadingState";

const MainEditor = dynamic(
  () => import("./MainEditor").then((m) => ({ default: m.MainEditor })),
  { loading: () => <LoadingState variant="overlay" message="Loading editor..." />, ssr: false }
);

const StoryBibleView = dynamic(
  () => import("./StoryBibleView").then((m) => ({ default: m.StoryBibleView })),
  { loading: () => <LoadingState variant="inline" message="Loading story bible..." /> }
);
```

Check if these are already dynamically imported elsewhere (DashboardView, etc.) and apply the same pattern.

- [ ] **Step 2: Run build to verify bundles**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ProjectWorkspace.tsx src/components/DashboardView.tsx
git commit -m "perf: dynamic import MainEditor and StoryBibleView for code splitting"
```

---

### Task 37: Add loading="lazy" to project cover images

**Files:**
- Modify: `src/components/DashboardView.tsx`

- [ ] **Step 1: Add lazy loading to images**

Read `src/components/DashboardView.tsx` first. Find `<Image>` components in the project grid. If they use `next/image`, add:

```tsx
<Image
  src={project.coverImage || "/placeholder.png"}
  alt={project.title}
  width={400}
  height={200}
  loading="lazy"
  className="..."
/>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/DashboardView.tsx
git commit -m "perf: add loading=lazy to dashboard project cover images"
```

---

### Task 38: Add bundle analyzer

**Files:**
- Modify: `next.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install and configure 

```bash
npm install --save-dev @next/bundle-analyzer
```

- [ ] **Step 2: Add analyze script**

In `package.json` `scripts`:

```json
"analyze": "ANALYZE=true next build"
```

- [ ] **Step 3: Configure in next.config.ts**

Read `next.config.ts` first. Add at the top:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@google-cloud/storage", "@google-cloud/text-to-speech"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  turbopack: { root: process.cwd() },
};

export default nextConfig;
```

Then wrap with bundle analyzer if ANALYZE env var is set:

```ts
import withBundleAnalyzer from "@next/bundle-analyzer";

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default withAnalyzer(nextConfig);
```

- [ ] **Step 4: Run analyzer and review**

```bash
npm run analyze
```

Review output to confirm MainEditor and StoryBibleView are split into separate chunks. Note any unexpected large bundles.

- [ ] **Step 5: Commit**

```bash
git add next.config.ts package.json package-lock.json
git commit -m "perf: add bundle analyzer for build size monitoring"
```

---

### Task 39: Enhance LandingView

**Files:**
- Modify: `src/components/LandingView.tsx`

- [ ] **Step 1: Add interactive demo section, reduce CTAs, add entrance animations**

Read `src/components/LandingView.tsx` first. Apply these changes:

1. Reduce CTA buttons from 4 to 2 (keep hero + bottom)
2. Add CSS entrance animation on the workspace preview:

```tsx
<div className="animate-[page-enter_0.5s_ease-out_0.2s_both]">
  {/* existing workspace preview */}
</div>
```

3. Add a readonly demo section between features and bottom CTA:

```tsx
<div className="bg-[var(--color-canvas)] py-24">
  <div className="mx-auto max-w-4xl px-6">
    <h2 className="mb-4 text-center text-2xl font-bold text-[var(--color-text)]">
      See how it works
    </h2>
    <p className="mb-8 text-center text-[var(--color-text-secondary)]">
      Contextra remembers your characters, plot threads, and world-building as you write.
    </p>
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
      {/* Simple readonly prose with styled text showing context-awareness */}
      <div className="prose prose-slate max-w-none text-[var(--color-text)]">
        <p>
          The council chamber fell silent as <mark className="rounded bg-amber-100 px-1 text-amber-900">Elara</mark>{" "}
          rose from her seat. Her hands, still bandaged from the encounter in the Ironwood Forest, gripped the edge
          of the obsidian table...
        </p>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Contextra memory: Elara was wounded in Chapter 3 during the Ironwood Forest confrontation.
          She carries bandages on both hands and has a lingering distrust of the Northern Alliance.
        </div>
      </div>
    </div>
  </div>
</div>
```

4. Add social proof placeholder:

```tsx
<p className="text-center text-sm text-[var(--color-text-muted)]">
  Trusted by writers worldwide
</p>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LandingView.tsx
git commit -m "feat: enhance landing page with interactive demo, reduced CTAs, entrance animation"
```

---

### Task 40: Add metadata and OG tags

**Files:**
- Modify: `src/app/[locale]/layout.tsx`

- [ ] **Step 1: Expand metadata**

Read `src/app/[locale]/layout.tsx` first. Replace the metadata object:

```tsx
export const metadata: Metadata = {
  title: {
    default: "Contextra — AI-Powered Collaborative Writing",
    template: "%s | Contextra",
  },
  description:
    "Write your next story with context-aware AI. Contextra remembers your characters, plot threads, and world-building as you write.",
  openGraph: {
    title: "Contextra — AI-Powered Collaborative Writing",
    description:
      "Write your next story with context-aware AI. Contextra remembers your characters, plot threads, and world-building as you write.",
    type: "website",
    siteName: "Contextra",
  },
  twitter: {
    card: "summary_large_image",
    title: "Contextra — AI-Powered Collaborative Writing",
    description:
      "Write your next story with context-aware AI.",
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\[locale\]/layout.tsx
git commit -m "feat: add Open Graph and Twitter Card metadata for SEO and social sharing"
```

---

### Task 41: Lighthouse performance audit

- [ ] **Step 1: Run a production build and Lighthouse audit**

```bash
npm run build && npm run start
```

In a separate terminal, run Lighthouse against `http://localhost:3000`. Verify:
- LCP < 2.5s on simulated 3G
- No layout shift on theme toggle
- Font loading doesn't block render
- Images have explicit dimensions

- [ ] **Step 2: Fix any regressions**

If Lighthouse reports issues not already addressed, apply fixes. Focus on:
- Image optimization (sizes attribute for responsive breakpoints)
- Font loading strategy (verify font-display: swap is set)
- Reduce any render-blocking resources

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "perf: Lighthouse audit fixes — ensure LCP < 2.5s on 3G"
```

---

### Task 42: Final integration test

- [ ] **Step 1: Run full test suite**

```bash
npx tsc --noEmit && npx vitest --run
```

- [ ] **Step 2: Full manual QA across all 18 themes**

Test on: Notion Light, Notion Dark, Mist Light, Mist Dark, Forest Light, Forest Dark, Cream Light, Cream Dark, Graphite Light, Graphite Dark, Rose Light, Rose Dark, Sage Light, Sage Dark, Harbor Light, Harbor Dark, Plum Light, Plum Dark.

For each: verify login, register, dashboard, project workspace, editor, AI pane, story bible, collaboration panel, preferences modal.

- [ ] **Step 3: Mobile smoke test (viewport < 768px)**
  - Login/register forms scroll correctly
  - Preferences modal tabs scroll horizontally
  - Project workspace sidebar is a drawer overlay
  - Editor is readable at 320px viewport

- [ ] **Step 4: Accessibility audit**
  - Tab through login form — labels visible, focus rings present
  - Tab through preferences modal — focus trapped, Escape closes
  - Tab from page load — skip-to-content link appears
  - Check color contrast: no text below 4.5:1 on any background

- [ ] **Step 5: Commit checkpoint**

```bash
git add -A
git commit -m "chore: Phase 5 + final integration complete — performance, landing page, full QA"
```

---

## Post-Implementation Checklist

- [ ] All 18 theme classes render correct semantic tokens
- [ ] Dark mode toggle works without flash
- [ ] All 125+ UI strings extracted to `en.json` + `vi.json`
- [ ] `/vi/*` routes display Vietnamese
- [ ] No hardcoded Tailwind colors in components
- [ ] Form labels visible (not sr-only) on login, register, preferences
- [ ] PreferencesModal has focus trap (Radix Dialog)
- [ ] Skip-to-content link navigable by keyboard
- [ ] Nav regions labeled with aria-label
- [ ] Contrast >= 4.5:1 for all body text
- [ ] Zen mode: fade chrome, auto-show on mouse, Escape exit
- [ ] Command palette: Cmd+K, search, arrow/enter navigation
- [ ] No dead "Coming soon" buttons (except Maximize2)
- [ ] Loading states use single LoadingState component
- [ ] Landing page has interactive demo, 2 CTAs, entrance animation
- [ ] LCP < 2.5s on 3G (Lighthouse)
- [ ] Only active font preloaded
- [ ] MainEditor and StoryBibleView are code-split
- [ ] `prefers-reduced-motion: reduce` disables all animations
- [ ] `prefers-color-scheme: dark` applies dark theme on first visit
