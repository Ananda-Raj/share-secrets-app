import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { config } from "./config.js";
import { formatFromAddress, type Branding } from "./settingsSchema.js";

const client = new SESv2Client({});

function supportLines(branding: Branding): string[] {
  return branding.supportEmail ? ["", `Questions? Contact ${branding.supportEmail}.`] : [];
}

async function send(to: string, subject: string, text: string, branding: Branding): Promise<void> {
  await client.send(
    new SendEmailCommand({
      FromEmailAddress: formatFromAddress(branding.appName, config.sesSenderEmail),
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject },
          Body: { Text: { Data: text } },
        },
      },
    })
  );
}

export async function sendSecretEmail(
  to: string,
  link: string,
  otp: string,
  otpValidMinutes: number,
  subject: string,
  senderEmail: string,
  branding: Branding
): Promise<void> {
  const text = [
    `${senderEmail} shared a secret with you through ${branding.appName}.`,
    "",
    `Open this link: ${link}`,
    "",
    `Enter this access code when prompted: ${otp}`,
    `The code expires in ${otpValidMinutes} minutes and can only be used once. If it expires before`,
    "you use it, the link above will let you request a new one — the link itself stays available",
    "much longer than the code does.",
    "",
    "The secret itself is not included in this email and can only be viewed once, by whoever enters the code first.",
    "If you weren't expecting this, you can safely ignore this email.",
    ...supportLines(branding),
  ].join("\n");

  await send(to, subject, text, branding);
}

/** Tells the sender their secret was opened. Never includes the secret itself. */
export async function sendOpenedNotice(
  to: string,
  recipientEmail: string,
  description: string,
  sentAt: number,
  branding: Branding
): Promise<void> {
  const text = [
    `${recipientEmail} opened the secret you shared through ${branding.appName}.`,
    "",
    `Description: ${description}`,
    `Sent: ${new Date(sentAt * 1000).toUTCString()}`,
    "",
    "It can't be opened again. If the recipient says they didn't open it, treat the secret as exposed and rotate it.",
    ...supportLines(branding),
  ].join("\n");

  await send(to, `Opened: ${description}`, text, branding);
}

/** Admin activity summary; the text is built in lib/summary.ts. */
export async function sendActivitySummary(to: string, subject: string, text: string, branding: Branding): Promise<void> {
  await send(to, subject, text, branding);
}

/**
 * Resend deliberately re-sends only a fresh OTP, never a reconstructed link — the
 * fragment key (`k1`) is only ever transient, used once at creation to build the
 * original email and never stored anywhere server-side. There's nothing to rebuild a
 * link from later without weakening that guarantee, so "resend" only helps when the
 * original email (with its link) is still around but the code in it expired; it can't
 * help if the whole email was lost.
 */
export async function sendResendOtpEmail(
  to: string,
  otp: string,
  otpValidMinutes: number,
  branding: Branding
): Promise<void> {
  const text = [
    `Here's a new one-time access code for the secret that was shared with you through ${branding.appName}.`,
    "",
    `Access code: ${otp}`,
    `This code expires in ${otpValidMinutes} minutes and can only be used once.`,
    "",
    "Use the link from the original email along with this new code — this message does not include a new link.",
    "If you weren't expecting this, you can safely ignore this email.",
    ...supportLines(branding),
  ].join("\n");

  await send(to, "Your new access code", text, branding);
}
