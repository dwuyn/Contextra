import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildUnsupportedMediaMessage,
  getVoiceDisplayLabel,
  isBrowserMediaSourceErrorMessage,
  readSegmentAudioResponse,
} from "@/components/PublicVoiceReader";

const originalCreateObjectUrl = URL.createObjectURL;

describe("PublicVoiceReader helpers", () => {
  afterEach(() => {
    URL.createObjectURL = originalCreateObjectUrl;
    vi.restoreAllMocks();
  });

  it("rejects localhost text responses before they reach the audio element", async () => {
    const response = new Response("Localhost returned HTML instead of audio", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });

    await expect(readSegmentAudioResponse(response, 0, false)).rejects.toThrow(
      "Voice reader returned text/plain instead of audio. Localhost returned HTML instead of audio",
    );
  });

  it("preserves playable audio response metadata for diagnostics", async () => {
    URL.createObjectURL = vi.fn(() => "blob:voice-reader");

    const response = new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "X-Voice-Reader-Cache": "miss",
      },
    });

    await expect(readSegmentAudioResponse(response, 0, false)).resolves.toEqual({
      index: 0,
      objectUrl: "blob:voice-reader",
      contentType: "audio/mpeg",
      byteLength: 3,
      cacheStatus: "miss",
    });
  });

  it("turns generic browser source errors into actionable diagnostics", () => {
    expect(
      buildUnsupportedMediaMessage(false, {
        index: 0,
        contentType: "audio/mpeg",
        byteLength: 3,
        cacheStatus: "miss",
      }),
    ).toContain("Segment 1 returned audio/mpeg, 3 bytes, cache miss");

    expect(
      isBrowserMediaSourceErrorMessage(
        "The media resource indicated by the src attribute or assigned media provider object was not suitable.",
      ),
    ).toBe(true);
  });

  it("maps curated voice ids to localized gender labels", () => {
    expect(
      getVoiceDisplayLabel({ id: "vi-VN-Neural2-A", label: "Google Neural2 A", language: "vi-VN" }, false),
    ).toBe("Female");
    expect(
      getVoiceDisplayLabel({ id: "vi-VN-Neural2-A", label: "Google Neural2 A", language: "vi-VN" }, true),
    ).toBe("Nữ");
    expect(
      getVoiceDisplayLabel({ id: "en-US-Neural2-D", label: "Google Neural2 D", language: "en-US" }, false),
    ).toBe("Male");
    expect(
      getVoiceDisplayLabel({ id: "vi-VN-Chirp3-HD-Charon", label: "Google Charon", language: "vi-VN" }, true),
    ).toBe("Nam");
  });
});
