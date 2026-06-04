import { describe, expect, it } from "vitest";
import {
  decodeBase64EncodedAudioBuffer,
  looksLikeMpegAudioBuffer,
  normalizeMpegAudioBuffer,
} from "@/lib/audio";

describe("looksLikeMpegAudioBuffer", () => {
  it("accepts ID3-tagged MP3 data", () => {
    expect(looksLikeMpegAudioBuffer(new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]))).toBe(true);
  });

  it("accepts MPEG frame sync headers", () => {
    expect(looksLikeMpegAudioBuffer(new Uint8Array([0xff, 0xfb, 0x90, 0x64]))).toBe(true);
  });

  it("rejects non-MP3 payloads", () => {
    expect(looksLikeMpegAudioBuffer(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]))).toBe(false);
  });

  it("decodes base64-encoded MP3 payloads", () => {
    const mp3Bytes = Buffer.from([0xff, 0xfb, 0x90, 0x64, 0x00, 0x01]);
    const base64Bytes = Buffer.from(mp3Bytes.toString("base64"), "utf8");

    expect(decodeBase64EncodedAudioBuffer(base64Bytes)).toEqual(mp3Bytes);
    expect(normalizeMpegAudioBuffer(base64Bytes)).toEqual(mp3Bytes);
  });
});
