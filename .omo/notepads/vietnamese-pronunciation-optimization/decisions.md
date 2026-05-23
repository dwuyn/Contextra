# Decisions

## T3: googleTtsService.ts — SSML support for vi-VN (2026-05-23)

### Decision
Updated `src/services/googleTtsService.ts` to support SSML-based TTS for Vietnamese (`vi-VN`) with cache invalidation and fallback behavior.

### Changes
- **vi-VN path**: Loads `PronunciationEntry` from DB → `processSegmentForTTS()` → SSML synthesis via Google TTS `input: { ssml }`
- **en-US path**: Preserved exactly — plain text input, no pronunciation processing
- **Cache key**: Extended `buildCacheObjectPath` to include `pronunciationProfileHash` (from `processSegmentForTTS`). `normalizerVersion` is embedded in the profile hash payload.
- **SSML fallback**: On Google TTS rejection, logs structured error (projectId, chapterId, voiceId, segmentIndex), falls back to plain text via `normalizeText()`, does NOT cache fallback under SSML key
- **Public API**: `SynthesizeSegmentInput` and return type unchanged

### Rationale
- SSML enables phoneme/sub/say_as pronunciation control for Vietnamese names and abbreviations
- Cache key includes pronunciation profile hash so audio invalidates when entries change
- Fallback ensures reliability if Google rejects malformed SSML
- en-US untouched to avoid regression risk

### Tradeoffs
- Fallback audio is not cached — repeated failures re-synthesize each time (acceptable for rare failures)
- Prisma enum widening requires `as PronunciationEntryData[]` cast (safe given schema constraints)
