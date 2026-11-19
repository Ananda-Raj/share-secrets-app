// All encryption/decryption happens here, entirely via the browser's native Web Crypto
// API — no third-party crypto dependency to audit or trust. Nothing in this file ever
// sends a key or password anywhere; callers decide what (if anything) gets sent to the API.

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const padLength = (4 - (value.length % 4)) % 4;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The random 256-bit key that always lives in the URL fragment (`#...`) — browsers
 * never transmit fragments to a server, so this never reaches any log or database. */
export function generateFragmentKey(): Uint8Array {
  return randomBytes(32);
}

async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", rawKey as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encrypt(plaintext: string, rawKey: Uint8Array): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const key = await importAesKey(rawKey);
  const iv = randomBytes(12);
  const buffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, textEncoder.encode(plaintext));
  return { ciphertext: new Uint8Array(buffer), iv };
}

/** Throws (auth tag mismatch) if the key is wrong or the ciphertext was tampered with. */
export async function decrypt(ciphertext: Uint8Array, iv: Uint8Array, rawKey: Uint8Array): Promise<string> {
  const key = await importAesKey(rawKey);
  const buffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ciphertext as BufferSource);
  return textDecoder.decode(buffer);
}
