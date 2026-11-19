import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LEN = 32;

/** Hashes an OTP for at-rest storage. Never store the raw OTP itself. */
export function hashOtp(otp: string): { hash: string; salt: string } {
  const salt = randomBytes(16);
  const hash = scryptSync(otp, salt, KEY_LEN);
  return { hash: hash.toString("hex"), salt: salt.toString("hex") };
}

/** Constant-time comparison so response timing can't leak how many digits matched. */
export function verifyOtp(otp: string, hashHex: string, saltHex: string): boolean {
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(otp, salt, KEY_LEN);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
