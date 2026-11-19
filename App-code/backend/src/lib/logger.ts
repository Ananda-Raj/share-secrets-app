// Belt-and-suspenders redaction: even if a future change accidentally passes one
// of these fields into a log call, it never reaches CloudWatch in the clear.
const FORBIDDEN_KEYS = new Set([
  "ciphertext",
  "iv",
  "salt",
  "otp",
  "code",
  "k1",
  "password",
  "otpHash",
  "otpSalt",
  // v2 additions, added ahead of the features that use them (roles/audit/description):
  // legitimate to store in DynamoDB for audit purposes, never legitimate in a log line.
  "senderEmail",
  "recipientEmail",
  "description",
  // Auth-settings additions: an IdP client secret and a generated temporary password are
  // both credentials, never legitimate in a log line even though the former is
  // legitimate to pass to Cognito and the latter is legitimate to hand an admin once.
  "clientSecret",
  "temporaryPassword",
]);

function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = FORBIDDEN_KEYS.has(key) ? "[redacted]" : value;
  }
  return out;
}

export function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...redact(fields) }));
}
