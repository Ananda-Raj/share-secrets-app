export type SecretMode = "email-otp";

/** DynamoDB item shape. Note what's deliberately absent: no plaintext secret,
 * no password, and no fragment encryption key (`k1`) — those never touch storage. */
export interface SecretItem {
  id: string;
  mode: SecretMode;
  ciphertext: string; // base64, AES-256-GCM ciphertext produced client-side
  iv: string; // base64
  createdAt: number; // epoch seconds
  expiresAt: number; // epoch seconds — also the DynamoDB TTL attribute
  claimedAt?: number; // epoch seconds, set on first successful fetch
  otpHash?: string; // hex scrypt hash
  otpSalt?: string; // hex
  otpExpiresAt?: number; // epoch seconds
  otpAttempts?: number;
  // Stored purely so a resend has somewhere to send the fresh code — never used for
  // anything else, never included in a log line (see logger.ts).
  recipientEmail?: string;
  otpResendCount?: number; // capped at config.otpMaxResends
  lastOtpSentAt?: number; // epoch seconds; enforces the resend cooldown
}

/** Minimal shape we rely on from the API Gateway HTTP API (v2) Lambda proxy event.
 * `authorizer.jwt.claims` is populated by API Gateway's native JWT authorizer (once
 * Cognito is wired up) *before* the Lambda ever runs — an unauthenticated request never
 * reaches this code at all. Present on the authenticated routes only (create, history,
 * admin); absent on the receiver-facing routes (meta/verify-otp/confirm/resend), which
 * stay open to anyone with the link since receivers never log in. */
export interface ApiEvent {
  rawPath: string;
  body?: string | null;
  queryStringParameters?: Record<string, string> | null;
  requestContext?: {
    http?: { method?: string };
    authorizer?: { jwt?: { claims?: Record<string, string> } };
  };
}

/** Sent by the EventBridge schedule instead of an HTTP request. */
export interface ScheduledTask {
  task: "monthly-summary";
}
