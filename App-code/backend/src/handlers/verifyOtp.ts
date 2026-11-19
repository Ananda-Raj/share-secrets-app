import { getSecret, claimSecret, incrementOtpAttempts, deleteSecret } from "../lib/dynamo.js";
import { markClaimed, type AuditRecord } from "../lib/audit.js";
import { getSettings } from "../lib/settings.js";
import { sendOpenedNotice } from "../lib/ses.js";
import { verifyOtp as checkOtp } from "../lib/otp.js";
import { json } from "../lib/response.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";
import { parseJsonBody, ValidationError } from "../lib/validation.js";
import type { ApiEvent } from "../types.js";

/** POST /secrets/{id}/verify-otp — the only way a receiver ever gets the ciphertext;
 * every secret is email+OTP now (link-mode removed). Only on a correct code does this
 * claim the one-time view and release the ciphertext. */
export async function verifyOtpHandler(event: ApiEvent, id: string) {
  let code: string;
  try {
    const body = parseJsonBody(event.body);
    code = typeof body.code === "string" ? body.code.trim() : "";
  } catch (err) {
    if (err instanceof ValidationError) return json(400, { error: err.message }, config.frontendOrigin);
    throw err;
  }

  const item = await getSecret(id);
  if (!item || item.mode !== "email-otp") return json(404, { error: "not_found" }, config.frontendOrigin);

  const now = Math.floor(Date.now() / 1000);
  if (!item.otpExpiresAt || item.otpExpiresAt < now) {
    await deleteSecret(id);
    return json(410, { error: "otp_expired" }, config.frontendOrigin);
  }
  if ((item.otpAttempts ?? 0) >= config.otpMaxAttempts) {
    await deleteSecret(id); // burn it — a code has plainly been compromised or is being brute-forced
    return json(429, { error: "too_many_attempts" }, config.frontendOrigin);
  }

  const valid = code.length === 6 && checkOtp(code, item.otpHash!, item.otpSalt!);
  if (!valid) {
    const attempts = await incrementOtpAttempts(id);
    log("secret.otp.invalid", { id, attempts });
    return json(401, { error: "invalid_code", attemptsRemaining: Math.max(config.otpMaxAttempts - attempts, 0) }, config.frontendOrigin);
  }

  const claim = await claimSecret(id, now, config.graceSeconds);
  if (claim === "expired") return json(410, { error: "expired_or_viewed" }, config.frontendOrigin);

  // Read receipt for the sender's history — audit-side only, must never block the
  // receiver actually getting their secret if it fails for some reason. Awaited (not
  // fire-and-forget): Lambda gives no guarantee an un-awaited promise finishes once the
  // handler has already returned its response.
  let audit: AuditRecord | undefined;
  try {
    audit = await markClaimed(id, now);
  } catch (err) {
    log("audit.mark_claimed.error", { id, error: String(err) });
  }

  // First claim only; a failed notice never blocks the receiver.
  if (claim === "claimed" && audit?.notifyOnOpen) {
    try {
      const { branding } = await getSettings();
      await sendOpenedNotice(audit.senderEmail, audit.recipientEmail, audit.description, audit.createdAt, branding);
      log("secret.open_notice.sent", { id });
    } catch (err) {
      log("secret.open_notice.error", { id, error: String(err) });
    }
  }

  log("secret.retrieved", { id, claim, via: "otp" });
  return json(200, { ciphertext: item.ciphertext, iv: item.iv }, config.frontendOrigin);
}
