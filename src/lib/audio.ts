export function looksLikeMpegAudioBuffer(buffer: Uint8Array) {
  if (buffer.byteLength < 2) {
    return false;
  }

  if (buffer.byteLength >= 3 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return true;
  }

  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

const BASE64_AUDIO_TEXT_PATTERN = /^[A-Za-z0-9+/=\r\n]+$/;

export function decodeBase64EncodedAudioBuffer(buffer: Uint8Array) {
  const text = Buffer.from(buffer).toString("utf8").trim();
  if (text.length < 8 || !BASE64_AUDIO_TEXT_PATTERN.test(text)) {
    return null;
  }

  const decoded = Buffer.from(text, "base64");
  if (decoded.byteLength === 0) {
    return null;
  }

  return decoded;
}

export function normalizeMpegAudioBuffer(buffer: Uint8Array) {
  const directBuffer = Buffer.from(buffer);
  if (looksLikeMpegAudioBuffer(directBuffer)) {
    return directBuffer;
  }

  const decodedBase64Buffer = decodeBase64EncodedAudioBuffer(directBuffer);
  if (decodedBase64Buffer && looksLikeMpegAudioBuffer(decodedBase64Buffer)) {
    return decodedBase64Buffer;
  }

  return null;
}
