import { createHash } from "node:crypto";
import type { ReaderLanguage } from "@/lib/voiceReader";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RenderMode = "sub" | "phoneme" | "say_as" | "plain";
export type MatchMode = "whole_word" | "literal";
export type Source = "manual" | "character" | "canon_entity" | "canon_alias" | "imported";
export type SayAsInterpretAs = "characters" | "spell-out" | "cardinal" | "ordinal" | "digits";

export type PronunciationEntryData = {
  term: string;
  replacement: string;
  renderMode: RenderMode;
  matchMode: MatchMode;
  caseSensitive: boolean;
  priority: number;
  enabled: boolean;
};

export type DictionaryMatch = {
  startIndex: number;
  endIndex: number;
  entry: PronunciationEntryData;
};

export type ProcessSegmentResult = {
  ssml: string;
  pronunciationProfileHash: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NORMALIZER_VERSION = "1.0.0";

const ALLOWED_RENDER_MODES: ReadonlySet<string> = new Set(["sub", "phoneme", "say_as", "plain"]);
const ALLOWED_MATCH_MODES: ReadonlySet<string> = new Set(["whole_word", "literal"]);
const ALLOWED_SAY_AS_INTERPRET_AS: ReadonlySet<string> = new Set([
  "characters",
  "spell-out",
  "cardinal",
  "ordinal",
  "digits",
]);

const MAX_TERM_LENGTH = 200;
const MAX_REPLACEMENT_LENGTH = 500;

// ---------------------------------------------------------------------------
// Default abbreviation dictionary for vi-VN
// ---------------------------------------------------------------------------

const DEFAULT_ABBREVIATIONS: PronunciationEntryData[] = [
  {
    term: "TP.HCM",
    replacement: "thành phố Hồ Chí Minh",
    renderMode: "plain",
    matchMode: "whole_word",
    caseSensitive: true,
    priority: -1,
    enabled: true,
  },
  {
    term: "VN",
    replacement: "Việt Nam",
    renderMode: "plain",
    matchMode: "whole_word",
    caseSensitive: true,
    priority: -1,
    enabled: true,
  },
  {
    term: "SSML",
    replacement: "spell-out",
    renderMode: "say_as",
    matchMode: "whole_word",
    caseSensitive: true,
    priority: -1,
    enabled: true,
  },
  {
    term: "AI",
    replacement: "spell-out",
    renderMode: "say_as",
    matchMode: "whole_word",
    caseSensitive: true,
    priority: -1,
    enabled: true,
  },
];

// ---------------------------------------------------------------------------
// XML Escaping
// ---------------------------------------------------------------------------

/**
 * Escape text for safe inclusion in SSML text nodes.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Escape text for safe inclusion in SSML attribute values.
 */
export function escapeXmlAttribute(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ---------------------------------------------------------------------------
// Text Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize input text for TTS processing.
 * - Unicode NFC normalization
 * - Non-breaking spaces to regular spaces
 * - Collapse repeated whitespace
 * - Normalize ellipses and dashes
 * - Normalize quote characters
 * - Preserve Vietnamese diacritics
 */
export function normalizeText(text: string): string {
  let result = text.normalize("NFC");

  // Convert non-breaking spaces to regular spaces
  result = result.replace(/\u00a0/g, " ");

  // Collapse repeated whitespace to single space
  result = result.replace(/[ \t]+/g, " ");

  // Normalize ellipses: "..." and "…" -> "…"
  result = result.replace(/\.\.\./g, "…");

  // Normalize dash characters to standard hyphen
  result = result.replace(/[\u2013\u2014]/g, "-");

  // Normalize quote characters to straight quotes
  result = result.replace(/[\u201C\u201D\u201E\u201F]/g, '"');
  result = result.replace(/[\u2018\u2019\u201A\u201B]/g, "'");

  return result.trim();
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateEntry(entry: PronunciationEntryData): PronunciationEntryData | null {
  if (!entry.enabled) return null;

  // Security: limit term and replacement lengths
  if (entry.term.length > MAX_TERM_LENGTH) return null;
  if (entry.replacement.length > MAX_REPLACEMENT_LENGTH) return null;

  // Allowlist validation
  if (!ALLOWED_RENDER_MODES.has(entry.renderMode)) return null;
  if (!ALLOWED_MATCH_MODES.has(entry.matchMode)) return null;

  // For say_as mode, validate interpret-as value in replacement
  if (entry.renderMode === "say_as" && !ALLOWED_SAY_AS_INTERPRET_AS.has(entry.replacement)) {
    return null;
  }

  // Skip empty terms
  if (entry.term.length === 0) return null;

  return entry;
}

// ---------------------------------------------------------------------------
// Dictionary Matching
// ---------------------------------------------------------------------------

/**
 * Apply dictionary entries to normalized text.
 * Returns sorted array of non-overlapping matches.
 */
export function applyDictionary(
  text: string,
  entries: PronunciationEntryData[],
): DictionaryMatch[] {
  // Filter and validate entries
  const validEntries = entries
    .map(validateEntry)
    .filter((e): e is PronunciationEntryData => e !== null);

  // Sort by descending priority, then by descending term length
  validEntries.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.term.length - a.term.length;
  });

  // Track which character ranges have been matched
  const matchedRanges: { start: number; end: number }[] = [];
  const matches: DictionaryMatch[] = [];

  function isRangeAvailable(start: number, end: number): boolean {
    for (const range of matchedRanges) {
      // Overlap check: ranges overlap if one starts before the other ends
      if (start < range.end && end > range.start) {
        return false;
      }
    }
    return true;
  }

  function lockRange(start: number, end: number) {
    matchedRanges.push({ start, end });
  }

  for (const entry of validEntries) {
    const term = entry.caseSensitive ? entry.term : entry.term.toLowerCase();
    const searchText = entry.caseSensitive ? text : text.toLowerCase();

    if (entry.matchMode === "whole_word") {
      // Unicode-aware word boundary matching
      // Word boundaries are spaces and punctuation for Vietnamese
      const escaped = escapeRegExp(term);
      const boundaryPattern = `(?<![^\s\\p{P}])${escaped}(?![^\s\\p{P}])`;
      const flags = entry.caseSensitive ? "gu" : "gui";
      const regex = new RegExp(boundaryPattern, flags);

      let match: RegExpExecArray | null;
      while ((match = regex.exec(searchText)) !== null) {
        const startIndex = match.index;
        const endIndex = startIndex + match[0].length;

        if (isRangeAvailable(startIndex, endIndex)) {
          matches.push({ startIndex, endIndex, entry });
          lockRange(startIndex, endIndex);
        }
      }
    } else {
      // Literal matching: simple string search
      let searchIndex = 0;
      while (true) {
        const foundIndex = searchText.indexOf(term, searchIndex);
        if (foundIndex === -1) break;

        const startIndex = foundIndex;
        const endIndex = startIndex + term.length;

        if (isRangeAvailable(startIndex, endIndex)) {
          matches.push({ startIndex, endIndex, entry });
          lockRange(startIndex, endIndex);
        }

        searchIndex = foundIndex + 1;
      }
    }
  }

  // Sort by startIndex
  matches.sort((a, b) => a.startIndex - b.startIndex);

  return matches;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// SSML Rendering
// ---------------------------------------------------------------------------

/**
 * Render SSML from text and dictionary matches.
 */
export function renderSSML(text: string, matches: DictionaryMatch[]): string {
  const parts: string[] = [];
  let currentIndex = 0;

  for (const match of matches) {
    // Output non-matched text before this match
    if (match.startIndex > currentIndex) {
      const plainText = text.slice(currentIndex, match.startIndex);
      parts.push(escapeXml(plainText));
    }

    // Output the matched segment with appropriate SSML tags
    const matchedText = text.slice(match.startIndex, match.endIndex);
    const escapedTerm = escapeXml(matchedText);
    const escapedReplacement = escapeXmlAttribute(match.entry.replacement);

    switch (match.entry.renderMode) {
      case "sub":
        parts.push(`<sub alias="${escapedReplacement}">${escapedTerm}</sub>`);
        break;
      case "phoneme":
        parts.push(`<phoneme alphabet="ipa" ph="${escapedReplacement}">${escapedTerm}</phoneme>`);
        break;
      case "say_as":
        parts.push(
          `<say-as interpret-as="${escapedReplacement}">${escapedTerm}</say-as>`,
        );
        break;
      case "plain":
        // Output the escaped replacement directly (no tags)
        parts.push(escapeXml(match.entry.replacement));
        break;
    }

    currentIndex = match.endIndex;
  }

  // Output remaining text after last match
  if (currentIndex < text.length) {
    parts.push(escapeXml(text.slice(currentIndex)));
  }

  let result = parts.join("");

  // Add controlled breaks around strong punctuation
  result = addBreaksForPunctuation(result);

  return `<speak>${result}</speak>`;
}

/**
 * Add <break> elements around strong punctuation markers without being too aggressive.
 */
function addBreaksForPunctuation(ssml: string): string {
  // Paragraph breaks: double newlines
  let result = ssml.replace(/\n\s*\n/g, '<break time="150ms"/>');

  // Section dividers: --- or ***
  result = result.replace(
    /(?:^|\n)\s*[-]{3,}\s*(?:\n|$)/g,
    '<break time="150ms"/>',
  );
  result = result.replace(
    /(?:^|\n)\s*[*]{3,}\s*(?:\n|$)/g,
    '<break time="150ms"/>',
  );

  return result;
}

// ---------------------------------------------------------------------------
// Profile Hash
// ---------------------------------------------------------------------------

/**
 * Build a SHA-256 hash of the pronunciation profile.
 * Changes to term, replacement, renderMode, matchMode, caseSensitive, or priority
 * will change the hash. Changes to notes will NOT change the hash.
 */
export function buildPronunciationProfileHash(
  projectId: string,
  language: string,
  entries: PronunciationEntryData[],
): string {
  // Filter to enabled entries only
  const enabledEntries = entries.filter((e) => e.enabled);

  // Build hashable data: sorted array of significant fields
  const hashData = enabledEntries
    .map((e) => ({
      term: e.term,
      replacement: e.replacement,
      renderMode: e.renderMode,
      matchMode: e.matchMode,
      caseSensitive: e.caseSensitive,
      priority: e.priority,
    }))
    .sort((a, b) => {
      // Sort by priority desc, then term asc for deterministic ordering
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.term.localeCompare(b.term);
    });

  const payload = JSON.stringify({
    projectId,
    language,
    normalizerVersion: NORMALIZER_VERSION,
    entries: hashData,
  });

  return createHash("sha256").update(payload).digest("hex");
}

// ---------------------------------------------------------------------------
// Main Pipeline
// ---------------------------------------------------------------------------

/**
 * Process a text segment for TTS: normalize, match dictionary, render SSML.
 */
export function processSegmentForTTS(params: {
  projectId: string;
  text: string;
  entries: PronunciationEntryData[];
  language: ReaderLanguage;
}): ProcessSegmentResult {
  const { projectId, text, entries, language } = params;

  // Step 1: Normalize text
  const normalized = normalizeText(text);

  // Step 2: Merge default abbreviations with user entries (for vi-VN)
  const allEntries =
    language === "vi-VN" ? [...DEFAULT_ABBREVIATIONS, ...entries] : entries;

  // Step 3: Apply dictionary matching
  const matches = applyDictionary(normalized, allEntries);

  // Step 4: Render SSML
  const ssml = renderSSML(normalized, matches);

  // Step 5: Build profile hash
  const pronunciationProfileHash = buildPronunciationProfileHash(
    projectId,
    language,
    allEntries,
  );

  return { ssml, pronunciationProfileHash };
}
