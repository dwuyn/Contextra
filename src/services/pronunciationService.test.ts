import { describe, it, expect } from "vitest";
import {
  escapeXml,
  escapeXmlAttribute,
  normalizeText,
  applyDictionary,
  renderSSML,
  buildPronunciationProfileHash,
  processSegmentForTTS,
  type PronunciationEntryData,
  type DictionaryMatch,
} from "./pronunciationService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<PronunciationEntryData> = {}): PronunciationEntryData {
  return {
    term: "test",
    replacement: "replacement",
    renderMode: "plain",
    matchMode: "whole_word",
    caseSensitive: true,
    priority: 0,
    enabled: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// escapeXml
// ---------------------------------------------------------------------------

describe("escapeXml", () => {
  it("escapes < to &lt;", () => {
    expect(escapeXml("<")).toBe("&lt;");
  });

  it("escapes > to &gt;", () => {
    expect(escapeXml(">")).toBe("&gt;");
  });

  it("escapes & to &amp;", () => {
    expect(escapeXml("&")).toBe("&amp;");
  });

  it("escapes \" to &quot;", () => {
    expect(escapeXml('"')).toBe("&quot;");
  });

  it("escapes ' to &apos;", () => {
    expect(escapeXml("'")).toBe("&apos;");
  });

  it("escapes combined HTML injection attempt", () => {
    expect(escapeXml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("escapes SSML tags in replacement text", () => {
    expect(escapeXml('<sub alias="evil">')).toBe(
      "&lt;sub alias=&quot;evil&quot;&gt;",
    );
  });

  it("passes plain text through unchanged", () => {
    expect(escapeXml("hello world")).toBe("hello world");
  });
});

// ---------------------------------------------------------------------------
// escapeXmlAttribute
// ---------------------------------------------------------------------------

describe("escapeXmlAttribute", () => {
  it("escapes all XML-special characters", () => {
    expect(escapeXmlAttribute('<>&"\'')).toBe("&lt;&gt;&amp;&quot;&apos;");
  });
});

// ---------------------------------------------------------------------------
// normalizeText
// ---------------------------------------------------------------------------

describe("normalizeText", () => {
  it("applies NFC normalization to composed vs decomposed diacritics", () => {
    // decomposed: e + combining acute accent
    const decomposed = "e\u0301";
    // composed: é
    const composed = "\u00e9";
    expect(normalizeText(decomposed)).toBe(normalizeText(composed));
  });

  it("converts non-breaking space to regular space", () => {
    expect(normalizeText("hello\u00a0world")).toBe("hello world");
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeText("hello   world")).toBe("hello world");
  });

  it("collapses tabs to single space", () => {
    expect(normalizeText("hello\t\tworld")).toBe("hello world");
  });

  it("converts ... to ellipsis", () => {
    expect(normalizeText("hello...world")).toBe("hello\u2026world");
  });

  it("converts en-dash to hyphen", () => {
    expect(normalizeText("hello\u2013world")).toBe("hello-world");
  });

  it("converts em-dash to hyphen", () => {
    expect(normalizeText("hello\u2014world")).toBe("hello-world");
  });

  it("converts smart double quotes to straight quotes", () => {
    expect(normalizeText("\u201Chello\u201D")).toBe('"hello"');
  });

  it("converts smart single quotes to straight quotes", () => {
    expect(normalizeText("\u2018hello\u2019")).toBe("'hello'");
  });

  it("preserves Vietnamese diacritics", () => {
    const vietnamese = "th\u00e0nh ph\u1ed1 H\u1ed3 Ch\u00ed Minh";
    expect(normalizeText(vietnamese)).toBe(vietnamese);
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeText("  hello  ")).toBe("hello");
  });
});

// ---------------------------------------------------------------------------
// applyDictionary - matching
// ---------------------------------------------------------------------------

describe("applyDictionary - matching", () => {
  it("longest match wins: Ho Chi Minh matches over Chi", () => {
    const text = "Ho Chi Minh.";
    const entries: PronunciationEntryData[] = [
      makeEntry({ term: "Chi", replacement: "chi-repl", priority: 5 }),
      makeEntry({ term: "Ho Chi Minh", replacement: "hcm-repl", priority: 5 }),
    ];
    const matches = applyDictionary(text, entries);
    const matchedTerms = matches.map((m) => text.slice(m.startIndex, m.endIndex));
    expect(matchedTerms).toContain("Ho Chi Minh");
    expect(matchedTerms).not.toContain("Chi");
  });

  it("higher priority wins for same term", () => {
    const text = "VN";
    const entries: PronunciationEntryData[] = [
      makeEntry({ term: "VN", replacement: "low-priority", priority: 5 }),
      makeEntry({ term: "VN", replacement: "high-priority", priority: 10 }),
    ];
    const matches = applyDictionary(text, entries);
    expect(matches).toHaveLength(1);
    expect(matches[0].entry.replacement).toBe("high-priority");
  });

  it("whole-word matching: VN matches VN but not inside VietNam", () => {
    const text = "VN. Not in VietNam";
    const entries: PronunciationEntryData[] = [
      makeEntry({ term: "VN", replacement: "vietnam-abbr" }),
    ];
    const matches = applyDictionary(text, entries);
    expect(matches).toHaveLength(1);
    expect(text.slice(matches[0].startIndex, matches[0].endIndex)).toBe("VN");
  });

  it("whole-word matching with Vietnamese diacritics", () => {
    const text = "th\u00e0nh.";
    const entries: PronunciationEntryData[] = [
      makeEntry({ term: "th\u00e0nh", replacement: "city" }),
    ];
    const matches = applyDictionary(text, entries);
    expect(matches).toHaveLength(1);
    expect(text.slice(matches[0].startIndex, matches[0].endIndex)).toBe("th\u00e0nh");
  });

  it("literal matching: TP.HCM matches including the dot", () => {
    const text = "I live in TP.HCM now";
    const entries: PronunciationEntryData[] = [
      makeEntry({
        term: "TP.HCM",
        replacement: "thanh pho HCM",
        matchMode: "literal",
      }),
    ];
    const matches = applyDictionary(text, entries);
    expect(matches).toHaveLength(1);
    expect(text.slice(matches[0].startIndex, matches[0].endIndex)).toBe("TP.HCM");
  });

  it("overlap prevention: Chi within Ho Chi Minh cannot be matched", () => {
    const text = "Ho Chi Minh.";
    const entries: PronunciationEntryData[] = [
      makeEntry({ term: "Ho Chi Minh", replacement: "hcm", priority: 10 }),
      makeEntry({ term: "Chi", replacement: "chi", priority: 5 }),
    ];
    const matches = applyDictionary(text, entries);
    const matchedTerms = matches.map((m) => text.slice(m.startIndex, m.endIndex));
    expect(matchedTerms).toEqual(["Ho Chi Minh"]);
  });

  it("case insensitive matching when caseSensitive=false", () => {
    const text = "vn.";
    const entries: PronunciationEntryData[] = [
      makeEntry({ term: "VN", replacement: "vietnam", caseSensitive: false }),
    ];
    const matches = applyDictionary(text, entries);
    expect(matches).toHaveLength(1);
    expect(text.slice(matches[0].startIndex, matches[0].endIndex)).toBe("vn");
  });

  it("disabled entries are skipped", () => {
    const text = "test";
    const entries: PronunciationEntryData[] = [
      makeEntry({ term: "test", replacement: "repl", enabled: false }),
    ];
    const matches = applyDictionary(text, entries);
    expect(matches).toHaveLength(0);
  });

  it("empty terms are skipped", () => {
    const text = "hello";
    const entries: PronunciationEntryData[] = [
      makeEntry({ term: "", replacement: "repl" }),
    ];
    const matches = applyDictionary(text, entries);
    expect(matches).toHaveLength(0);
  });

  it("terms exceeding MAX_TERM_LENGTH are skipped", () => {
    const text = "hello";
    const longTerm = "a".repeat(201);
    const entries: PronunciationEntryData[] = [
      makeEntry({ term: longTerm, replacement: "repl" }),
    ];
    const matches = applyDictionary(text, entries);
    expect(matches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// renderSSML
// ---------------------------------------------------------------------------

describe("renderSSML", () => {
  it("sub renders with alias", () => {
    const text = "VN";
    const matches: DictionaryMatch[] = [
      {
        startIndex: 0,
        endIndex: 2,
        entry: makeEntry({ term: "VN", replacement: "Viet Nam", renderMode: "sub" }),
      },
    ];
    const result = renderSSML(text, matches);
    expect(result).toBe('<speak><sub alias="Viet Nam">VN</sub></speak>');
  });

  it("phoneme renders with IPA alphabet", () => {
    const text = "hello";
    const matches: DictionaryMatch[] = [
      {
        startIndex: 0,
        endIndex: 5,
        entry: makeEntry({
          term: "hello",
          replacement: "h\u0259\u02c8lo\u028a",
          renderMode: "phoneme",
        }),
      },
    ];
    const result = renderSSML(text, matches);
    expect(result).toBe('<speak><phoneme alphabet="ipa" ph="h\u0259\u02c8lo\u028a">hello</phoneme></speak>');
  });

  it("say_as renders with interpret-as", () => {
    const text = "AI";
    const matches: DictionaryMatch[] = [
      {
        startIndex: 0,
        endIndex: 2,
        entry: makeEntry({
          term: "AI",
          replacement: "spell-out",
          renderMode: "say_as",
        }),
      },
    ];
    const result = renderSSML(text, matches);
    expect(result).toBe('<speak><say-as interpret-as="spell-out">AI</say-as></speak>');
  });

  it("plain renders just the escaped replacement text", () => {
    const text = "VN";
    const matches: DictionaryMatch[] = [
      {
        startIndex: 0,
        endIndex: 2,
        entry: makeEntry({ term: "VN", replacement: "Viet Nam", renderMode: "plain" }),
      },
    ];
    const result = renderSSML(text, matches);
    expect(result).toBe("<speak>Viet Nam</speak>");
  });

  it("non-matched text is escaped and included", () => {
    const text = "Hello VN world";
    const matches: DictionaryMatch[] = [
      {
        startIndex: 6,
        endIndex: 8,
        entry: makeEntry({ term: "VN", replacement: "Viet Nam", renderMode: "plain" }),
      },
    ];
    const result = renderSSML(text, matches);
    expect(result).toBe("<speak>Hello Viet Nam world</speak>");
  });

  it("output is wrapped in <speak> tags", () => {
    const text = "hello";
    const matches: DictionaryMatch[] = [];
    const result = renderSSML(text, matches);
    expect(result).toBe("<speak>hello</speak>");
  });

  it("SSML injection attempt in term gets escaped", () => {
    const text = '<script>alert(1)</script>';
    const matches: DictionaryMatch[] = [];
    const result = renderSSML(text, matches);
    expect(result).toBe(
      "<speak>&lt;script&gt;alert(1)&lt;/script&gt;</speak>",
    );
  });

  it("escapes non-matched text with special characters", () => {
    const text = "a < b & c > d";
    const matches: DictionaryMatch[] = [];
    const result = renderSSML(text, matches);
    expect(result).toBe("<speak>a &lt; b &amp; c &gt; d</speak>");
  });
});

// ---------------------------------------------------------------------------
// buildPronunciationProfileHash
// ---------------------------------------------------------------------------

describe("buildPronunciationProfileHash", () => {
  const baseEntries: PronunciationEntryData[] = [
    makeEntry({ term: "VN", replacement: "Viet Nam", priority: 5 }),
    makeEntry({ term: "AI", replacement: "spell-out", renderMode: "say_as", priority: 3 }),
  ];

  it("same entries produce same hash", () => {
    const hash1 = buildPronunciationProfileHash("proj1", "vi-VN", baseEntries);
    const hash2 = buildPronunciationProfileHash("proj1", "vi-VN", baseEntries);
    expect(hash1).toBe(hash2);
  });

  it("changing a replacement changes the hash", () => {
    const hash1 = buildPronunciationProfileHash("proj1", "vi-VN", baseEntries);
    const modified = baseEntries.map((e) =>
      e.term === "VN" ? { ...e, replacement: "Vietnamese" } : e,
    );
    const hash2 = buildPronunciationProfileHash("proj1", "vi-VN", modified);
    expect(hash1).not.toBe(hash2);
  });

  it("disabling an entry changes the hash", () => {
    const hash1 = buildPronunciationProfileHash("proj1", "vi-VN", baseEntries);
    const modified = baseEntries.map((e) =>
      e.term === "VN" ? { ...e, enabled: false } : e,
    );
    const hash2 = buildPronunciationProfileHash("proj1", "vi-VN", modified);
    expect(hash1).not.toBe(hash2);
  });

  it("changing priority changes the hash", () => {
    const hash1 = buildPronunciationProfileHash("proj1", "vi-VN", baseEntries);
    const modified = baseEntries.map((e) =>
      e.term === "VN" ? { ...e, priority: 100 } : e,
    );
    const hash2 = buildPronunciationProfileHash("proj1", "vi-VN", modified);
    expect(hash1).not.toBe(hash2);
  });

  it("notes field is NOT included in hash", () => {
    // The hash function doesn't include notes, so adding notes shouldn't change the hash
    const entriesWithNotes = baseEntries.map((e) => ({
      ...e,
      notes: "some note",
    })) as PronunciationEntryData[];
    const hash1 = buildPronunciationProfileHash("proj1", "vi-VN", baseEntries);
    const hash2 = buildPronunciationProfileHash("proj1", "vi-VN", entriesWithNotes);
    expect(hash1).toBe(hash2);
  });

  it("returns a hex string", () => {
    const hash = buildPronunciationProfileHash("proj1", "vi-VN", baseEntries);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// processSegmentForTTS
// ---------------------------------------------------------------------------

describe("processSegmentForTTS", () => {
  it("returns SSML wrapped in <speak>", () => {
    const result = processSegmentForTTS({
      projectId: "proj1",
      text: "hello world",
      entries: [],
      language: "en-US",
    });
    expect(result.ssml).toMatch(/^<speak>.*<\/speak>$/);
  });

  it("returns a non-empty pronunciationProfileHash", () => {
    const result = processSegmentForTTS({
      projectId: "proj1",
      text: "hello",
      entries: [],
      language: "en-US",
    });
    expect(result.pronunciationProfileHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("for vi-VN: includes default abbreviations", () => {
    const result = processSegmentForTTS({
      projectId: "proj1",
      text: "TP.HCM",
      entries: [],
      language: "vi-VN",
    });
    // TP.HCM should be expanded by default abbreviations
    expect(result.ssml).toContain("th\u00e0nh ph\u1ed1 H\u1ed3 Ch\u00ed Minh");
  });

  it("for en-US: no default abbreviations added", () => {
    const result = processSegmentForTTS({
      projectId: "proj1",
      text: "TP.HCM",
      entries: [],
      language: "en-US",
    });
    // TP.HCM should NOT be expanded for en-US
    expect(result.ssml).not.toContain("th\u00e0nh ph\u1ed1 H\u1ed3 Ch\u00ed Minh");
  });

  it("normalizes text before processing", () => {
    const result = processSegmentForTTS({
      projectId: "proj1",
      text: "hello   world",
      entries: [],
      language: "en-US",
    });
    // Whitespace should be collapsed
    expect(result.ssml).toContain("hello world");
  });

  it("merges user entries with default abbreviations for vi-VN", () => {
    const userEntries: PronunciationEntryData[] = [
      makeEntry({ term: "VN", replacement: "custom VN", priority: 10 }),
    ];
    const result = processSegmentForTTS({
      projectId: "proj1",
      text: "VN",
      entries: userEntries,
      language: "vi-VN",
    });
    // User entry with higher priority should win over default
    expect(result.ssml).toContain("custom VN");
  });
});
