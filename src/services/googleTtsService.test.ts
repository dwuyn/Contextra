import { vi, describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before imports
// ---------------------------------------------------------------------------

const mockSynthesizeSpeech = vi.fn();
const mockListVoices = vi.fn();

vi.mock("@google-cloud/text-to-speech", () => {
  return {
    TextToSpeechClient: vi.fn().mockImplementation(class {
      synthesizeSpeech = mockSynthesizeSpeech;
      listVoices = mockListVoices;
    }),
  };
});

vi.mock("@google-cloud/storage", () => {
  const saveMock = vi.fn().mockResolvedValue(undefined);
  const downloadMock = vi.fn().mockResolvedValue([Buffer.from("cached-audio")]);
  const existsMock = vi.fn().mockResolvedValue([false]);
  const fileMock = vi.fn().mockReturnValue({
    exists: existsMock,
    download: downloadMock,
    save: saveMock,
    delete: vi.fn().mockResolvedValue(undefined),
  });
  const bucketMock = vi.fn().mockReturnValue({
    file: fileMock,
  });
  return {
    Storage: vi.fn().mockImplementation(() => ({
      bucket: bucketMock,
    })),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pronunciationEntry: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import {
  synthesizeWithSsml,
  synthesizeWithText,
  listAvailableVoices,
  clearVoiceListCache,
} from "./googleTtsService";

describe("googleTtsService", () => {
  let clientInstance: TextToSpeechClient;

  beforeEach(() => {
    vi.clearAllMocks();
    clearVoiceListCache();
    process.env.GOOGLE_TTS_CACHE_BUCKET = "test-bucket";
    clientInstance = new TextToSpeechClient();
  });

  describe("synthesizeWithSsml", () => {
    it("calls synthesizeSpeech with correct shape and returns Buffer", async () => {
      mockSynthesizeSpeech.mockResolvedValue([{
        audioContent: Buffer.from("mpeg-data"),
      }]);

      const result = await synthesizeWithSsml(clientInstance, "<speak>Hello</speak>", "en-US", "en-US-Neural2-F", 1.15);

      expect(mockSynthesizeSpeech).toHaveBeenCalledWith({
        input: { ssml: "<speak>Hello</speak>" },
        voice: { languageCode: "en-US", name: "en-US-Neural2-F" },
        audioConfig: { audioEncoding: "MP3", speakingRate: 1.15 },
      });
      expect(result.toString()).toBe("mpeg-data");
    });
  });

  describe("synthesizeWithText", () => {
    it("calls synthesizeSpeech with correct shape and returns Buffer", async () => {
      mockSynthesizeSpeech.mockResolvedValue([{
        audioContent: Buffer.from("mpeg-data"),
      }]);

      const result = await synthesizeWithText(clientInstance, "Hello", "en-US", "en-US-Neural2-F", 1.15);

      expect(mockSynthesizeSpeech).toHaveBeenCalledWith({
        input: { text: "Hello" },
        voice: { languageCode: "en-US", name: "en-US-Neural2-F" },
        audioConfig: { audioEncoding: "MP3", speakingRate: 1.15 },
      });
      expect(result.toString()).toBe("mpeg-data");
    });
  });

  describe("listAvailableVoices", () => {
    it("maps, deduplicates, and returns only Neural2 voices", async () => {
      const mockVoices = [
        { name: "en-US-Standard-A", ssmlGender: "FEMALE", naturalSampleRateHertz: 24000 },
        { name: "en-US-Neural2-F", ssmlGender: "FEMALE", naturalSampleRateHertz: 24000 },
        { name: "en-US-Neural2-F", ssmlGender: "FEMALE", naturalSampleRateHertz: 24000 },
        { name: "en-US-Wavenet-D", ssmlGender: "MALE", naturalSampleRateHertz: 24000 },
        { name: "en-US-Neural2-J", ssmlGender: "MALE", naturalSampleRateHertz: 24000 },
      ];
      mockListVoices.mockResolvedValue([{ voices: mockVoices }]);

      const result = await listAvailableVoices("en-US");

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("en-US-Neural2-F");
      expect(result[0].family).toBe("Neural2");
      expect(result[0].gender).toBe("FEMALE");
      expect(result[0].label).toBe("Female");

      expect(result[1].id).toBe("en-US-Neural2-J");
      expect(result[1].family).toBe("Neural2");
      expect(result[1].gender).toBe("MALE");
      expect(result[1].label).toBe("Male");
    });

    it("falls back to stale cache on network failure", async () => {
      const mockVoices = [
        { name: "en-US-Neural2-F", ssmlGender: "FEMALE", naturalSampleRateHertz: 24000 },
      ];
      mockListVoices.mockResolvedValueOnce([{ voices: mockVoices }]);

      // First call populates cache
      const firstResult = await listAvailableVoices("en-US");
      expect(firstResult).toHaveLength(1);
      expect(firstResult[0].label).toBe("Female");

      const originalNow = Date.now;
      Date.now = () => originalNow() + 13 * 60 * 60 * 1000; // 13 hours later (expired TTL)

      mockListVoices.mockRejectedValueOnce(new Error("API Error"));

      const secondResult = await listAvailableVoices("en-US");
      expect(secondResult).toHaveLength(1);
      expect(secondResult[0].id).toBe("en-US-Neural2-F");
      expect(secondResult[0].label).toBe("Female");

      Date.now = originalNow;
    });
  });
});
