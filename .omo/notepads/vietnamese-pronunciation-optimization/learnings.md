# Vietnamese Pronunciation Optimization - Learnings

## 2026-05-23: pronunciationService.ts created

### File: `src/services/pronunciationService.ts`

**Exports**: `normalizeText()`, `applyDictionary()`, `renderSSML()`, `buildPronunciationProfileHash()`, `processSegmentForTTS()`, `escapeXml()`, `escapeXmlAttribute()`

**Types**: `RenderMode`, `MatchMode`, `Source`, `SayAsInterpretAs`, `PronunciationEntryData`, `DictionaryMatch`, `ProcessSegmentResult`

**Key decisions**:
- `DEFAULT_ABBREVIATIONS` loaded at priority -1 (below user entries at default 0)
- `applyDictionary` uses non-overlapping range locking: once a character range is matched, no other entry can claim it
- `whole_word` matching uses `(?<![^\s\p{P}])TERM(?![^\s\p{P}])` with `u` flag for Unicode-aware boundaries
- `say_as` mode validates `replacement` against allowlist: `characters`, `spell-out`, `cardinal`, `ordinal`, `digits`
- Security: term max 200 chars, replacement max 500 chars, all XML escaped in text nodes and attributes
- `buildPronunciationProfileHash` excludes `notes` field (doesn't affect audio output)
- `processSegmentForTTS` merges defaults only for `vi-VN` language

**Dependencies**:
- `node:crypto` for SHA-256 hashing
- `@/lib/voiceReader` for `ReaderLanguage` type
- No new npm dependencies added

**Verification**: `tsc --noEmit` passes with zero errors
