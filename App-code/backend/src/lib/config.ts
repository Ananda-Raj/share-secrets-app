function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  tableName: requireEnv("TABLE_NAME"),
  // Exact scheme+host of the deployed frontend (no trailing slash), e.g.
  // "https://d111111abcdef8.cloudfront.net". Used both as the fixed CORS
  // allow-origin and to build links sent by email.
  frontendOrigin: requireEnv("FRONTEND_ORIGIN"),
  sesSenderEmail: requireEnv("SES_SENDER_EMAIL"),
  // How long a claimed-but-not-yet-confirmed secret survives, so a mistyped
  // password/OTP doesn't destroy it before the real recipient succeeds.
  graceSeconds: Number(process.env.GRACE_SECONDS ?? 300),
  otpTtlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 600),
  otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
  // Capped + cooldown-limited so "resend" can't be used to spam the recipient's inbox.
  otpMaxResends: Number(process.env.OTP_MAX_RESENDS ?? 2),
  otpResendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 60),
  rolesTableName: requireEnv("ROLES_TABLE_NAME"),
  auditTableName: requireEnv("AUDIT_TABLE_NAME"),
  settingsTableName: requireEnv("SETTINGS_TABLE_NAME"),
  // Used only by lib/cognitoAdmin.ts's admin-driven auth-settings endpoints (configuring
  // an OIDC provider or creating a local account at runtime) — every other handler only
  // ever reads the caller's identity from the JWT authorizer's claims, never Cognito's
  // own API.
  userPoolId: requireEnv("USER_POOL_ID"),
  userPoolClientId: requireEnv("USER_POOL_CLIENT_ID"),
};
