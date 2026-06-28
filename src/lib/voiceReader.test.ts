import { describe, expect, it } from "vitest";
import { getLocaleDefaultReaderLanguage } from "@/lib/voiceReader";

describe("getLocaleDefaultReaderLanguage", () => {
  it("returns vi-VN for Vietnamese locales", () => {
    expect(getLocaleDefaultReaderLanguage("vi")).toBe("vi-VN");
    expect(getLocaleDefaultReaderLanguage("vi-VN")).toBe("vi-VN");
    expect(getLocaleDefaultReaderLanguage("vi_HAN")).toBe("vi-VN");
  });

  it("returns en-US for English locales", () => {
    expect(getLocaleDefaultReaderLanguage("en")).toBe("en-US");
    expect(getLocaleDefaultReaderLanguage("en-US")).toBe("en-US");
    expect(getLocaleDefaultReaderLanguage("en-GB")).toBe("en-US");
  });

  it("returns en-US for any non-Vietnamese locale", () => {
    expect(getLocaleDefaultReaderLanguage("fr")).toBe("en-US");
    expect(getLocaleDefaultReaderLanguage("ja")).toBe("en-US");
    expect(getLocaleDefaultReaderLanguage("de")).toBe("en-US");
    expect(getLocaleDefaultReaderLanguage("es")).toBe("en-US");
  });

  it("returns en-US for empty string", () => {
    expect(getLocaleDefaultReaderLanguage("")).toBe("en-US");
  });
});
