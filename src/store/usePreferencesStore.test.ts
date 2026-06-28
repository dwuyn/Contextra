import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { usePreferencesStore } from "@/store/usePreferencesStore";
import type { ReaderLanguage } from "@/lib/voiceReader";

function isReaderLanguage(value: string): value is ReaderLanguage {
  return value === "en-US" || value === "vi-VN";
}

/**
 * Pure migration logic — mirrors the store's v5→v6 migrate function.
 */
function migrateV5ToV6(persisted: Record<string, unknown>) {
  const raw =
    "readerLanguage" in persisted
      ? persisted.readerLanguage
      : persisted.readerLanguageMode;
  const value = typeof raw === "string" ? raw : "auto";
  return {
    readerLanguage: isReaderLanguage(value) ? value : "en-US",
  };
}

beforeEach(() => {
  usePreferencesStore.setState({
    theme: "notion",
    font: "be-vietnam-pro",
    readerLanguage: "en-US",
    readerRate: 1,
    readerVoiceEn: "",
    readerVoiceVi: "",
  });
});

describe("usePreferencesStore", () => {
  it("defaults readerLanguage to en-US", () => {
    expect(usePreferencesStore.getState().readerLanguage).toBe("en-US");
  });

  it("setReaderLanguage updates the language", () => {
    usePreferencesStore.getState().setReaderLanguage("vi-VN");
    expect(usePreferencesStore.getState().readerLanguage).toBe("vi-VN");
  });

  it("setReaderLanguage toggles between English and Vietnamese", () => {
    usePreferencesStore.getState().setReaderLanguage("vi-VN");
    expect(usePreferencesStore.getState().readerLanguage).toBe("vi-VN");
    expect(usePreferencesStore.getState().readerRate).toBe(1);

    usePreferencesStore.getState().setReaderLanguage("en-US");
    expect(usePreferencesStore.getState().readerLanguage).toBe("en-US");
  });

  it("setReaderVoice stores separate voice per language", () => {
    usePreferencesStore.getState().setReaderVoice("en-US", "en-US-Neural2-F");
    usePreferencesStore.getState().setReaderVoice("vi-VN", "vi-VN-Neural2-A");

    const state = usePreferencesStore.getState();
    expect(state.readerVoiceEn).toBe("en-US-Neural2-F");
    expect(state.readerVoiceVi).toBe("vi-VN-Neural2-A");
  });

  it("setReaderRate updates the rate", () => {
    usePreferencesStore.getState().setReaderRate(1.3);
    expect(usePreferencesStore.getState().readerRate).toBe(1.3);
  });
});

describe("Preferences migration v5 → v6", () => {
  it("converts legacy readerLanguageMode 'auto' to en-US", () => {
    expect(migrateV5ToV6({ readerLanguageMode: "auto" }).readerLanguage).toBe("en-US");
  });

  it("converts legacy readerLanguageMode 'vi-VN' to vi-VN", () => {
    expect(migrateV5ToV6({ readerLanguageMode: "vi-VN" }).readerLanguage).toBe("vi-VN");
  });

  it("converts legacy readerLanguageMode 'en-US' to en-US", () => {
    expect(migrateV5ToV6({ readerLanguageMode: "en-US" }).readerLanguage).toBe("en-US");
  });

  it("defaults to en-US when readerLanguageMode is missing", () => {
    expect(migrateV5ToV6({}).readerLanguage).toBe("en-US");
  });

  it("preserves valid readerLanguage from version 6+", () => {
    expect(migrateV5ToV6({ readerLanguage: "vi-VN" }).readerLanguage).toBe("vi-VN");
  });

  it("prefers readerLanguage over readerLanguageMode when both exist", () => {
    expect(
      migrateV5ToV6({ readerLanguage: "vi-VN", readerLanguageMode: "auto" }).readerLanguage,
    ).toBe("vi-VN");
  });

  it("defaults to en-US for invalid language values", () => {
    expect(migrateV5ToV6({ readerLanguageMode: "invalid-lang" }).readerLanguage).toBe("en-US");
  });

  it("defaults to en-US for non-string readerLanguageMode", () => {
    expect(migrateV5ToV6({ readerLanguageMode: 123 }).readerLanguage).toBe("en-US");
  });
});
