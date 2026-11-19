import { putSecret, deleteSecret } from "../lib/dynamo.js";
import { createAuditRecord, markFailed } from "../lib/audit.js";
import { generateSecretId, generateOtp } from "../lib/ids.js";
import { hashOtp } from "../lib/otp.js";
import { sendSecretEmail } from "../lib/ses.js";
import { isRecipientRejected } from "../lib/sesErrors.js";
import { getCallerEmail, UnauthorizedError } from "../lib/auth.js";
import { getSettings } from "../lib/settings.js";
import { emailMatchesDomains } from "../lib/settingsSchema.js";
import { json } from "../lib/response.js";
import {
  assertValidTtl,
  assertNonEmptyB64,
  assertValidEmail,
  sanitizeSubject,
  sanitizeDescription,
  parseJsonBody,
  LIMITS,
  ValidationError,
} from "../lib/validation.js";
import { config } from "../lib/config.js";
import { log } from "../lib/logger.js";
import type { ApiEvent } from "../types.js";

/**
 * POST /secrets — the only creation path. The sender must be logged in (read via
 * getCallerEmail); receivers never log in.
 *
 * This is the one place the fragment key (`k1`) reaches the server: needed in-memory,
 * once, to build the link we email. It is used only to compose the message below and
 * is never written to DynamoDB or passed to the logger — it goes out of scope when this
 * function returns. Same treatment for the freshly generated `otp`.
 */
export async function createSecret(event: ApiEvent) {
  try {
    const senderEmail = getCallerEmail(event);
    const { branding, policy } = await getSettings();
    if (!emailMatchesDomains(senderEmail, policy.allowedSenderDomains)) {
      return json(403, { error: "Your account isn't allowed to send secrets here." }, config.frontendOrigin);
    }

    const body = parseJsonBody(event.body);
    const ciphertext = assertNonEmptyB64(body.ciphertext, "ciphertext", LIMITS.MAX_CIPHERTEXT_B64_LEN);
    const iv = assertNonEmptyB64(body.iv, "iv", LIMITS.MAX_IV_B64_LEN);
    const k1 = assertNonEmptyB64(body.k1, "k1", LIMITS.MAX_K1_B64_LEN);
    const recipientEmail = assertValidEmail(body.recipientEmail);
    if (!emailMatchesDomains(recipientEmail, policy.allowedRecipientDomains)) {
      throw new ValidationError(`Recipients must have an address at: ${policy.allowedRecipientDomains.join(", ")}`);
    }
    const ttlSeconds = Math.min(assertValidTtl(body.ttlSeconds), policy.maxTtlSeconds);
    const subject = sanitizeSubject(body.subject);
    const description = sanitizeDescription(body.description);
    // Display metadata only (History/Admin show "Text" vs "File") -- malformed input
    // safely defaults to false, same trust level as the rest of the audit record.
    const isFile = body.isFile === true;
    // Advisory: the server can't see inside the ciphertext, so this only stops the normal UI path.
    if (isFile && !policy.fileSharingEnabled) throw new ValidationError("File attachments are turned off.");
    const notifyOnOpen = body.notifyOnOpen === true;

    const now = Math.floor(Date.now() / 1000);
    const id = generateSecretId();
    const otp = generateOtp();
    const { hash, salt } = hashOtp(otp);

    await putSecret({
      id,
      mode: "email-otp",
      ciphertext,
      iv,
      createdAt: now,
      expiresAt: now + ttlSeconds,
      otpHash: hash,
      otpSalt: salt,
      otpExpiresAt: now + config.otpTtlSeconds,
      otpAttempts: 0,
      // Stored only so a resend has somewhere to send the fresh code — see
      // resendOtp.ts and lib/ses.ts's sendResendOtpEmail for why resend can't
      // reconstruct the original link itself.
      recipientEmail,
    });

    await createAuditRecord({
      secretId: id,
      senderEmail,
      recipientEmail,
      description,
      mode: "email-otp",
      isFile,
      notifyOnOpen,
      createdAt: now,
      secretExpiresAt: now + ttlSeconds,
    });

    const link = `${config.frontendOrigin}/s/${id}#${k1}`;
    try {
      await sendSecretEmail(recipientEmail, link, otp, Math.round(config.otpTtlSeconds / 60), subject, senderEmail, branding);
    } catch (err) {
      // Nothing was sent: delete the secret and mark the history row "Not sent".
      const undo = await Promise.allSettled([deleteSecret(id), markFailed(id, now)]);
      if (undo.some((r) => r.status === "rejected")) log("secret.rollback.error", { id });
      log("secret.email.error", { id, error: String(err) });
      if (isRecipientRejected(err)) {
        return json(
          422,
          { error: `Couldn't email ${recipientEmail}. While email is in test (sandbox) mode, each recipient has to be verified first.` },
          config.frontendOrigin
        );
      }
      return json(502, { error: "email_failed" }, config.frontendOrigin);
    }

    log("secret.created", { id, mode: "email-otp" });
    return json(201, { id }, config.frontendOrigin);
  } catch (err) {
    if (err instanceof UnauthorizedError) return json(401, { error: "unauthorized" }, config.frontendOrigin);
    if (err instanceof ValidationError) return json(400, { error: err.message }, config.frontendOrigin);
    log("secret.create.error", { error: String(err) });
    return json(500, { error: "internal_error" }, config.frontendOrigin);
  }
}
