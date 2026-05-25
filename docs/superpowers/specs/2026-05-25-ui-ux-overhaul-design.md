# Contextra UI/UX Overhaul — Design Spec

**Date**: 2026-05-25  
**Visual direction**: Digital Parchment (warm tactile minimalism)  
**Approach**: Foundation-first, layered phases

## Decisions

| Decision    | Direction                                  |
| ----------- | ------------------------------------------ |
| Moodboard   | Digital Parchment (warm tactile)           |
| Dark mode   | Top priority, first                        |
| Mobile      | Desktop-first, "good enough" mobile        |
| Coming soon | Remove most, keep Maximize for zen mode    |
| i18n        | Set up now                                 |
| Performance | Aggressive (<2.5s LCP on 3G)               |
| Strategic   | Design tokens + Zen mode + Command palette |

## Phase 1: Design Token Architecture + Dark Mode

### Token System

Replace current 2-variable system (`--background`, `--foreground`) with 10 semantic tokens. Each of 18 themes (9 light + 9 dark) defines values for each token. Components reference tokens via Tailwind arbitrary values (`bg-[var(--color-surface)]`), never hardcoded colors.

**Tokens**:
- `--color-canvas` — page background
- `--color-surface` — cards, panels, modals
- `--color-surface-alt` — sidebar, hover states
- `--color-border` — separators, dividers
- `--color-text` — primary text (heading/body)
- `--color-text-secondary` — secondary/helper text
- `--color-text-muted` — disabled/placeholder (WCAG AA exception)
- `--color-accent` — links, active states, CTAs
- `--color-accent-muted` — accent backgrounds
- `--color-success` — save indicators, confirmation
- `--color-destructive` — delete, errors

### Contrast Guarantees

All tokens pre-audited for WCAG AA:
- `--color-text` on canvas/surface: >= 5:1
- `--color-text-secondary` on canvas/surface: >= 4.5:1
- `--color-text-muted`: >= 3:1 (large/UI text only, not body text)

### Digital Parchment Palette (18 themes)

| Light Theme | Canvas  | Accent  | Dark Canvas | Dark Surface |
| ----------- | ------- | ------- | ----------- | ------------ |
| Notion      | #f7f7f5 | #2563eb | #1a1a1f     | #25252d      |
| Mist        | #eaf6fb | #06b6d4 | #0d1f26     | #1a2d35      |
| Forest      | #eaf8ef | #059669 | #0d1f18     | #1a2d25      |
| Cream       | #fff8e6 | #d97706 | #1f1a10     | #2d2618      |
| Graphite    | #f3f5f7 | #334155 | #171a1f     | #242730      |
| Rose        | #fff1f3 | #e11d48 | #1f1418     | #2d1f23      |
| Sage        | #eef7f2 | #16a34a | #111e18     | #1e2a23      |
| Harbor      | #e9f7f8 | #0e7490 | #0d1f22     | #1a2c30      |
| Plum        | #f7edf8 | #9333ea | #1c1520     | #2a2130      |

Dark theme class names: `notion-dark`, `mist-dark`, etc.

### CSS Structure

```css
/* Layer 1: 18 theme classes define all tokens */
.theme-notion       { --color-canvas: #f7f7f5; --color-surface: #ffffff; ... }
.theme-notion-dark  { --color-canvas: #1a1a1f; --color-surface: #25252d; ... }
/* ... 18 total */

/* Layer 2: Body and editor tokens */
body { color: var(--color-text); background: var(--color-canvas); ... }
body { --color-editor-bg: var(--color-surface); ... }

/* Layer 3: Transition for smooth toggle */
*, *::before, *::after {
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } }
```

### Dark Mode Toggle

Theme Families approach: a single light/dark toggle in PreferencesModal flips the selected theme to its dark counterpart (e.g., `notion` <-> `notion-dark`). The user's theme *family* stays consistent. No need for independent light+dark selection.

### Flash Prevention

An inline `<script>` in `layout.tsx` reads `localStorage` preferences and applies the theme class to `<html>` before first paint. Detects `prefers-color-scheme: dark` for first-time visitors.

### File Changes

| File                                | Change                                             |
| ----------------------------------- | -------------------------------------------------- |
| `src/app/globals.css`               | 18 theme classes, semantic tokens, dark variants   |
| `src/lib/appearance.ts`             | Dark theme IDs, 9 new theme options                |
| `src/components/PreferencesModal.tsx` | Light/dark toggle in Appearance tab               |
| `src/app/layout.tsx`                | Inline script to apply theme before paint          |

## Phase 2: Component Token Migration + i18n

### i18n Infrastructure

Use `next-intl` (App Router compatible). English as source of truth, Vietnamese as second language.

```
src/
  messages/
    en.json         # ~125 UI strings, flat key namespace
    vi.json         # Vietnamese translations
  lib/i18n.ts        # next-intl config, getMessages helper
```

Routes: `/[locale]/*` pattern. Default locale `en` rewritten to root path. Vietnamese at `/vi/*`.

**String categories**: Auth (~25), Navigation/Dashboard (~30), Editor toolbar/AI (~20), Preferences (~35), Errors (~15).

### Token Migration Pattern

Replace all hardcoded color classes across ~18 components:

| Before              | After                               |
| ------------------- | ----------------------------------- |
| `bg-white`          | `bg-[var(--color-surface)]`          |
| `bg-[#f7f7f5]`      | `bg-[var(--color-canvas)]`           |
| `text-slate-900`    | `text-[var(--color-text)]`           |
| `text-slate-500`    | `text-[var(--color-text-secondary)]` |
| `text-slate-300/400` | Removed (tokens with guaranteed contrast) |
| `border-slate-200`  | `border-[var(--color-border)]`       |
| `bg-slate-50`       | `bg-[var(--color-surface-alt)]`      |
| `text-blue-600`     | `text-[var(--color-accent)]`         |
| `bg-blue-50`        | `bg-[var(--color-accent-muted)]`     |

### Migration Order

1. Leaf components (badges, buttons, inputs)
2. Panel components (AI pane, sidebar, stories panel)
3. Page components (Dashboard, Project Workspace, Login, Register)
4. Modals (Preferences, Delete Confirmation)
5. Editor (MainEditor)

Each file receives both token migration and i18n string extraction in one pass to avoid double-touching.

### File Changes

| File                                | Tokens | i18n   |
| ----------------------------------- | ------ | ------ |
| `src/app/globals.css`               | Full   | —      |
| `src/lib/appearance.ts`             | Full   | —      |
| `src/lib/i18n.ts`                   | —      | New    |
| `src/messages/en.json`              | —      | New    |
| `src/messages/vi.json`              | —      | New    |
| `src/app/[locale]/layout.tsx`       | —      | New    |
| `src/components/PreferencesModal.tsx` | Light  | Light  |
| `src/components/LoginView.tsx`      | Light  | Full   |
| `src/components/RegisterView.tsx`   | Light  | Full   |
| `src/components/DashboardView.tsx`  | Medium | Medium |
| `src/components/ProjectWorkspace.tsx` | Medium | Medium |
| `src/components/MainEditor.tsx`     | Heavy  | Medium |
| `src/components/AiCardsPane.tsx`    | Light  | Light  |
| `src/components/StoryBibleView.tsx` | Medium | Medium |
| ~12 remaining components            | Light  | Light  |

## Phase 3: Accessibility + Polish

### Visible Form Labels (H4)

Replace `sr-only` span labels in `LoginView.tsx`, `RegisterView.tsx`, `PreferencesModal.tsx` with visible `<label>` elements. Labels use `--color-text-secondary` token for guaranteed contrast.

### PreferencesModal Focus Trap + Mobile Layout (H3)

Wrap in Radix `<Dialog.Root>` for free focus trapping, Escape handling, and scroll lock. On screens < 768px, the 72px vertical tab sidebar becomes a horizontal scrollable tab bar.

### Contrast Migration (H5)

Find-and-replace all remaining Tailwind color classes with token references. `text-slate-300` becomes decorative-only. `text-slate-400` becomes secondary text token. Each instance requires judgment: decorative vs informational.

### Skip-to-Content Link (M3)

Add `<a href="#main-content">` skip link to layout. Add `<nav aria-label>` to sidebar navigation in ProjectWorkspace.

### Coming-Soon Cleanup (M6)

| Location                       | Action                            |
| ------------------------------ | --------------------------------- |
| `AiCardsPane.tsx:323-329`      | Remove Upgrade + Support buttons  |
| `AiCardsPane.tsx:243-245`      | Remove ThumbsUp/Down/Star         |
| `ProjectWorkspace.tsx:318`     | Remove MoreHorizontal             |
| `DashboardView.tsx:305-308`    | Fix copy conditional              |
| `MainEditor.tsx:1359-1362`     | Remove BubbleMenu Expand          |
| `MainEditor.tsx:1287-1289`     | **Keep** Maximize2 for zen mode   |

### Editor Toolbar Discoverability (M5)

Remove `ChevronDown` icons from AI action buttons (they're single-action, not dropdowns). Wrap in Radix `<Tooltip>` with keyboard shortcut hints.

### Loading State Consolidation (M4)

Extract `LoadingState` component with `variant` prop (`inline` | `overlay` | `fullscreen`). Replace 4 duplicate loading components.

### File Changes

| File                                | Change                                    |
| ----------------------------------- | ----------------------------------------- |
| `src/components/LoginView.tsx`      | Visible labels                             |
| `src/components/RegisterView.tsx`   | Visible labels                             |
| `src/components/PreferencesModal.tsx` | Radix Dialog, mobile layout               |
| `src/app/[locale]/layout.tsx`       | Skip link, main landmark                  |
| `src/components/ProjectWorkspace.tsx` | nav aria-label                            |
| `src/components/AiCardsPane.tsx`    | Remove dead buttons                        |
| `src/components/DashboardView.tsx`  | Conditional copy, remove MoreHorizontal    |
| `src/components/MainEditor.tsx`     | Remove ChevronDown, Radix Tooltips         |
| `src/components/LoadingState.tsx`   | New component                              |
| ~10 files                           | Contrast class replacements               |

## Phase 4: Zen Mode + Command Palette

### Zen Mode

Full-screen distraction-free writing. Sidebar, toolbar, AI pane, status bar fade out (500ms). Editor centers with `max-w-2xl` constraint. Chrome auto-shows on mouse movement near top 40px, hides after 3s stillness. Exit via Escape or bottom-right button.

**State**: Ephemeral Zustand store (`useZenStore`), not persisted. Keyboard shortcut: `Cmd+Shift+F`.

### Command Palette

`Cmd+K` / `Ctrl+K` overlay with search-as-you-type filtering. Groups: Navigation, Chapters, AI Actions, Settings, Projects. Keyboard-navigable (arrow keys + Enter). Uses Radix `<Dialog.Root>`.

### File Changes

| File                                | Change                                |
| ----------------------------------- | ------------------------------------- |
| `src/store/useZenStore.ts`          | New Zustand store                     |
| `src/components/CommandPalette.tsx` | New component                          |
| `src/components/ProjectWorkspace.tsx` | Zen layout, mouse tracking            |
| `src/components/MainEditor.tsx`     | Hide toolbar/bubble menu in zen       |
| `src/components/AiCardsPane.tsx`    | Hide in zen                           |
| `src/messages/en.json`              | zen.* and command.* strings           |

## Phase 5: Performance + Landing Page

### Performance

- **Font lazy-loading**: Only preload the active font family. Inline script reads preference before `<link>` tags. Uses `media` attribute on `<link rel="preload">` to avoid loading unused fonts. Saves ~350KB.
- **Code splitting**: Dynamic import for `MainEditor.tsx` and `StoryBibleView.tsx` with loading fallbacks.
- **Image optimization**: Add `loading="lazy"` to dashboard project covers. Review `unoptimized` prop usage.
- **Bundle analysis**: `@next/bundle-analyzer` with `npm run analyze` script.

### Landing Page (M2)

- Interactive readonly Tiptap demo section below hero
- Workspace preview with fade-in + Y-axis parallax on scroll
- Social proof placeholder
- CTA reduction: 4 -> 2 "Create account" buttons
- Digital Parchment warm aesthetic (cream canvas, subtle grain via CSS)

### Motion & Micro-interactions (M1)

Sprinkled across components:
- Layout-level fade-in on page transitions (200ms)
- Editor crossfade on chapter change (150ms)
- Save indicator: pulse -> checkmark animation (600ms)
- Sidebar chapter list: stagger entrance with `animation-delay`
- All respect `prefers-reduced-motion: reduce`

## Testing Strategy

| Phase | Tests                                                                                       |
| ----- | ------------------------------------------------------------------------------------------- |
| 1     | All 18 theme CSS classes render correct tokens. Contrast audit passes WCAG AA.              |
| 2     | Every component renders correctly in light+dark. No missing translations. No hardcoded colors. |
| 3     | Focus trap works in PreferencesModal. Skip link visible on Tab. Form labels visible.         |
| 4     | Zen mode renders, toolbar auto-shows, Escape exits. Palette filters and executes commands.   |
| 5     | LCP < 2.5s on 3G (Lighthouse). Font preload loads only active font.                         |

Automated: Vitest unit tests for `appearance.ts` functions, `usePreferencesStore` transitions.
Manual: Visual regression across 3 themes x 2 modes = 6 combos on key screens.

## Risk & Rollback

| Risk                                      | Mitigation                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| Token migration breaks a component visually | Test each component in light+dark after migration. Screenshot comparison. |
| i18n strings not all translated            | Ship English first, Vietnamese as follow-up.                              |
| Dark mode flash on load                    | Inline `<script>` in `<head>` for theme before paint.                     |
| Zen mode blocks accidental exit            | Explicit Escape + click-to-exit.                                         |
| Performance regressions                     | Measure before/after bundle sizes with analyze script.                    |

Each phase ships as a separate PR. Tokens + dark mode deploy behind feature flag (dark toggle hidden until all components are migrated).
