import { getIdToken } from "./auth.js";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public attemptsRemaining?: number
  ) {
    super(message);
  }
}

/** Thrown by an authenticated call when there's no valid session — the caller should
 * redirect to auth.ts's login(), not treat this as a normal request failure. */
export class AuthRequiredError extends Error {}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error ?? `request_failed_${res.status}`, res.status, data.error, data.attemptsRemaining);
  }
  return data as T;
}

/** Same as request(), but for the sender-facing routes (create, history, admin) —
 * attaches the Cognito ID token (see auth.ts's TokenResponse comment for why the ID
 * token and not the access token), refreshed first if it's close to expiring so a
 * near-expired session doesn't fail mid-request. The receiver-facing routes
 * (meta/verify-otp/confirm/resend) never use this — receivers still don't log in. */
async function authenticatedRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getIdToken();
  if (!token) throw new AuthRequiredError("Not logged in");
  return request<T>(path, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers ?? {}) } });
}

export function createSecret(body: {
  ciphertext: string;
  iv: string;
  k1: string;
  recipientEmail: string;
  ttlSeconds: number;
  subject: string;
  description: string;
  isFile: boolean;
  notifyOnOpen: boolean;
}) {
  return authenticatedRequest<{ id: string }>("/secrets", { method: "POST", body: JSON.stringify(body) });
}

export function getSecretMeta(id: string) {
  return request<{ exists: boolean }>(`/secrets/${id}/meta`);
}

export function verifyOtp(id: string, code: string) {
  return request<{ ciphertext: string; iv: string }>(`/secrets/${id}/verify-otp`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function confirmBurn(id: string) {
  return request<{ ok: boolean }>(`/secrets/${id}/confirm`, { method: "POST" });
}

export function resendOtp(id: string) {
  return request<{ ok: boolean }>(`/secrets/${id}/resend`, { method: "POST" });
}

export interface HistoryItem {
  secretId: string;
  recipientEmail: string;
  description: string | null;
  // Both undefined for a record written before this field existed -- older sends just
  // can't show a type or an "Expired" status, same as they couldn't before.
  isFile?: boolean;
  createdAt: number;
  secretExpiresAt?: number;
  claimedAt: number | null;
  confirmedAt: number | null;
  revokedAt: number | null;
}

export function getMyHistory() {
  return authenticatedRequest<{ items: HistoryItem[] }>("/my/history");
}

/** Sender-only cancel for a mistaken send -- has no effect once the recipient has
 * already claimed it. Authenticated: the backend checks the caller is the original
 * sender, not just anyone logged in. */
export function revokeSecret(secretId: string) {
  return authenticatedRequest<{ ok: boolean }>(`/secrets/${secretId}/revoke`, { method: "POST" });
}

export interface AdminAuditItem extends HistoryItem {
  senderEmail: string;
}

function rangeQuery(fromEpoch?: number, toEpoch?: number): string {
  const params = new URLSearchParams();
  if (fromEpoch !== undefined) params.set("from", String(fromEpoch));
  if (toEpoch !== undefined) params.set("to", String(toEpoch));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function getAdminAudit(fromEpoch?: number, toEpoch?: number) {
  return authenticatedRequest<{ items: AdminAuditItem[] }>(`/admin/audit${rangeQuery(fromEpoch, toEpoch)}`);
}

export interface SenderCount {
  senderEmail: string;
  count: number;
}

export function getAdminStats(fromEpoch?: number, toEpoch?: number) {
  return authenticatedRequest<{ topSenders: SenderCount[] }>(`/admin/stats${rangeQuery(fromEpoch, toEpoch)}`);
}

export type Role = "admin" | "user";

/** Sharing rules as they apply to the signed-in user. */
export interface MyPolicy {
  canSend: boolean;
  allowedRecipientDomains: string[];
  maxTtlSeconds: number;
  defaultTtlSeconds: number;
  fileSharingEnabled: boolean;
  ttlChoices: number[];
}

export interface Me {
  email: string;
  role: Role;
  policy?: MyPolicy;
}

let mePromise: Promise<Me> | null = null;

/** Once per page load (shared by the nav and the page). Also where the very-first-login
 * admin bootstrap fires. */
export function getMe(): Promise<Me> {
  mePromise ??= authenticatedRequest<Me>("/me").catch((err) => {
    mePromise = null;
    throw err;
  });
  return mePromise;
}

export interface AuthSettings {
  selfSignupEnabled: boolean;
  configuredIdps: string[];
}

export function getAdminAuthSettings() {
  return authenticatedRequest<AuthSettings>("/admin/auth-settings");
}

export function updateAdminAuthSettings(selfSignupEnabled: boolean) {
  return authenticatedRequest<{ ok: boolean }>("/admin/auth-settings", {
    method: "POST",
    body: JSON.stringify({ selfSignupEnabled }),
  });
}

export function configureIdp(body: { idpName: string; issuerUrl: string; clientId: string; clientSecret: string }) {
  return authenticatedRequest<{ ok: boolean; idpName: string }>("/admin/idp", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createLocalUser(email: string) {
  return authenticatedRequest<{ email: string; temporaryPassword: string }>("/admin/users", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export interface CognitoUserSummary {
  username: string;
  email: string;
  status: string;
  enabled: boolean;
  isFederated: boolean;
  isAdmin: boolean;
  createdAt: string;
}

export function listAdminUsers() {
  return authenticatedRequest<{ users: CognitoUserSummary[]; yourEmail: string; rolesTableName: string }>(
    "/admin/users"
  );
}

export function removeAdminUser(username: string, email: string) {
  return authenticatedRequest<{ ok: boolean }>("/admin/users/remove", {
    method: "POST",
    body: JSON.stringify({ username, email }),
  });
}

export interface Branding {
  appName: string;
  logoDataUrl: string;
  accentColor: string;
  supportEmail: string;
  footerText: string;
}

export interface SharingPolicy {
  allowedSenderDomains: string[];
  allowedRecipientDomains: string[];
  maxTtlSeconds: number;
  defaultTtlSeconds: number;
  fileSharingEnabled: boolean;
}

export interface Reports {
  monthlySummary: boolean;
}

export interface AdminSettings {
  branding: Branding;
  policy: SharingPolicy;
  reports: Reports;
  ttlChoices: number[];
}

/** Public: also shown to receivers, who never sign in. */
export function getBranding() {
  return request<Branding>("/branding");
}

export function getAdminSettings() {
  return authenticatedRequest<AdminSettings>("/admin/settings");
}

export function updateAdminSettings(changes: { branding?: Branding; policy?: SharingPolicy; reports?: Reports }) {
  return authenticatedRequest<AdminSettings>("/admin/settings", {
    method: "POST",
    body: JSON.stringify(changes),
  });
}

/** Emails the last 30 days' summary to the calling admin only. */
export function sendSummaryPreview() {
  return authenticatedRequest<{ sentTo: string }>("/admin/summary/preview", { method: "POST" });
}
