import { describe, expect, it } from "vitest";

import {
  buildChapterIllustrationPromptWriterInput,
  hasMeaningfulIllustrationSource,
} from "./chapterIllustrationService";

describe("hasMeaningfulIllustrationSource", () => {
  it("returns false for empty rich-text content", () => {
    expect(hasMeaningfulIllustrationSource("<p></p>")).toBe(false);
    expect(hasMeaningfulIllustrationSource("<h1> </h1><p><br></p>")).toBe(false);
  });

  it("returns true when visible text exists", () => {
    expect(hasMeaningfulIllustrationSource("<p>The harbor burned at dusk.</p>")).toBe(true);
  });
});

describe("buildChapterIllustrationPromptWriterInput", () => {
  it("includes the key generation constraints and optional art direction", () => {
    const prompt = buildChapterIllustrationPromptWriterInput(
      {
        projectName: "Contextra",
        genre: "Epic fantasy",
        summary: "A war between floating kingdoms.",
        tone: "Lyrical and ominous",
        audience: "Adult",
        worldRules: ["Airships are powered by stormglass."],
        characters: [
          {
            name: "Mira",
            role: "Captain",
            memory: "A disciplined smuggler haunted by a failed mutiny.",
          },
        ],
      },
      {
        chapterTitle: "The Harbor of Ash",
        chapterContent: "<p>Mira guided the burning ship into harbor.</p>",
        customInstruction: "oil-painted, rain-swept, no visible faces",
      },
    );

    expect(prompt).toContain("Return strict JSON only");
    expect(prompt).toContain("No text, no lettering, no typography");
    expect(prompt).toContain("The Harbor of Ash");
    expect(prompt).toContain("Mira guided the burning ship into harbor.");
    expect(prompt).toContain("oil-painted, rain-swept, no visible faces");
  });
});
