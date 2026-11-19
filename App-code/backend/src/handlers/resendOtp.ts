import { getSecret, resendOtp as resendOtpInDb } from "../lib/dynamo.js";
import { generateOtp } from "../lib/ids.js";
import { hashOtp } from "../lib/otp.js";
import { sendResendOtpEmail } from "../lib/ses.js";
import { getSettings } from "../lib/settings.js";
import { json } from "../lib/response.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";
import type { ApiEvent } from "../types.js";
import type { ResendResult } from "../lib/dynamo.js";

const STATUS: Record<ResendResult, number> = {
  sent: 200,
  not_found: 404,
  already_claimed: 410,
  too_many_resends: 429,
  cooldown: 429,
};

const ERROR: Partial<Record<ResendResult, string>> = {
  not_found: "not_found",
  already_claimed: "expired_or_viewed",
  too_many_resends: "too_many_resends",
  cooldown: "resend_cooldown",
};

/** POST /secrets/{id}/resend — a fresh OTP only, never a reconstructed link (see
 * lib/ses.ts's sendResendOtpEmail for why). Capped and cooldown-limited via
 * lib/dynamo.ts's resendOtp so this can't be used to spam the recipient's inbox. */
export async function resendOtpHandler(_event: ApiEvent, id: string) {
  const item = await getSecret(id);
  if (!item || item.mode !== "email-otp" || !item.recipientEmail) {
    return json(404, { error: "not_found" }, config.frontendOrigin);
  }

  const now = Math.floor(Date.now() / 1000);
  const otp = generateOtp();
  const { hash, salt } = hashOtp(otp);

  const result = await resendOtpInDb(
    id,
    now,
    hash,
    salt,
    now + config.otpTtlSeconds,
    config.otpMaxResends,
    config.otpResendCooldownSeconds
  );

  if (result !== "sent") {
    return json(STATUS[result], { error: ERROR[result] }, config.frontendOrigin);
  }

  const { branding } = await getSettings();
  await sendResendOtpEmail(item.recipientEmail, otp, Math.round(config.otpTtlSeconds / 60), branding);
  log("secret.otp.resent", { id });
  return json(200, { ok: true }, config.frontendOrigin);
}
