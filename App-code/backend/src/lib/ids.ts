import { randomBytes, randomInt } from "node:crypto";

/** 128 bits of randomness, URL-safe — long enough that guessing an id is infeasible. */
export function generateSecretId(): string {
  return randomBytes(16).toString("base64url");
}

/** Cryptographically-random 6-digit numeric OTP, zero-padded. */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
