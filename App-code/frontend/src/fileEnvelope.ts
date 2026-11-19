// A file is JSON-wrapped with a fixed marker prefix, then encrypted as an ordinary
// string -- the same encrypt()/decrypt() used for text, no crypto.ts changes needed.
// The marker is how the unlock page tells "this is a file" from "this is text" after
// decrypting, without any backend change: ciphertext is opaque to the server either way.
const MARKER = "secretshare-file-v1:";

export interface FilePayload {
  filename: string;
  mimeType: string;
  data: string; // base64url-encoded file bytes
}

export const MAX_FILE_BYTES = 150 * 1024;

export function encodeFilePayload(payload: FilePayload): string {
  return MARKER + JSON.stringify(payload);
}

export function decodeFilePayload(plaintext: string): FilePayload | null {
  if (!plaintext.startsWith(MARKER)) return null;
  try {
    return JSON.parse(plaintext.slice(MARKER.length)) as FilePayload;
  } catch {
    return null;
  }
}
