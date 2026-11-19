import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateBranding,
  validatePolicy,
  validateReports,
  parseDomainList,
  emailMatchesDomains,
  withDefaults,
  formatFromAddress,
  DEFAULT_SETTINGS,
  SETTINGS_LIMITS,
} from "../src/lib/settingsSchema.js";
import { ValidationError } from "../src/lib/validation.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const goodPolicy = {
  allowedSenderDomains: [],
  allowedRecipientDomains: [],
  maxTtlSeconds: 86400,
  defaultTtlSeconds: 3600,
  fileSharingEnabled: true,
};

test("validateBranding accepts a full, valid branding", () => {
  const b = validateBranding({
    appName: "  Acme Secrets ",
    logoDataUrl: PNG,
    accentColor: "#AA3300",
    supportEmail: "it@acme.com",
    footerText: "Internal use only",
  });
  assert.equal(b.appName, "Acme Secrets");
  assert.equal(b.accentColor, "#aa3300");
  assert.equal(b.logoDataUrl, PNG);
});

test("validateBranding allows optional fields to be empty", () => {
  const b = validateBranding({ appName: "Acme" });
  assert.deepEqual(b, { appName: "Acme", logoDataUrl: "", accentColor: "", supportEmail: "", footerText: "" });
});

test("validateBranding requires a name", () => {
  assert.throws(() => validateBranding({ appName: "   " }), ValidationError);
});

test("validateBranding rejects bad colors, emails and control characters", () => {
  assert.throws(() => validateBranding({ appName: "A", accentColor: "red" }), ValidationError);
  assert.throws(() => validateBranding({ appName: "A", accentColor: "#12345" }), ValidationError);
  assert.throws(() => validateBranding({ appName: "A", supportEmail: "not-an-email" }), ValidationError);
  assert.throws(() => validateBranding({ appName: "A\nB" }), ValidationError);
});

test("validateBranding rejects SVG, non-image and oversized logos", () => {
  assert.throws(() => validateBranding({ appName: "A", logoDataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }), ValidationError);
  assert.throws(() => validateBranding({ appName: "A", logoDataUrl: "javascript:alert(1)" }), ValidationError);
  assert.throws(() => validateBranding({ appName: "A", logoDataUrl: "data:text/html;base64,PGI+" }), ValidationError);
  const huge = "data:image/png;base64," + "A".repeat(SETTINGS_LIMITS.MAX_LOGO_DATA_URL_LEN);
  assert.throws(() => validateBranding({ appName: "A", logoDataUrl: huge }), ValidationError);
});

test("parseDomainList normalizes, dedupes and accepts a string", () => {
  assert.deepEqual(parseDomainList("Acme.com, @partner.io\nacme.com", "d"), ["acme.com", "partner.io"]);
  assert.deepEqual(parseDomainList(undefined, "d"), []);
  assert.deepEqual(parseDomainList(["sub.acme.co.uk"], "d"), ["sub.acme.co.uk"]);
});

test("parseDomainList rejects invalid domains", () => {
  assert.throws(() => parseDomainList("acme", "d"), ValidationError);
  assert.throws(() => parseDomainList("bad_domain.com", "d"), ValidationError);
  assert.throws(() => parseDomainList("a@b.com", "d"), ValidationError);
  assert.throws(() => parseDomainList(42, "d"), ValidationError);
});

test("validatePolicy accepts a valid policy", () => {
  const p = validatePolicy({ ...goodPolicy, allowedRecipientDomains: "acme.com" });
  assert.deepEqual(p.allowedRecipientDomains, ["acme.com"]);
  assert.equal(p.maxTtlSeconds, 86400);
});

test("validatePolicy rejects lifetimes outside the choices or default above max", () => {
  assert.throws(() => validatePolicy({ ...goodPolicy, maxTtlSeconds: 1234 }), ValidationError);
  assert.throws(() => validatePolicy({ ...goodPolicy, defaultTtlSeconds: 604800 }), ValidationError);
  assert.throws(() => validatePolicy({ ...goodPolicy, fileSharingEnabled: "yes" }), ValidationError);
});

test("emailMatchesDomains: empty list allows everyone", () => {
  assert.equal(emailMatchesDomains("anyone@anywhere.net", []), true);
});

test("emailMatchesDomains matches the domain and its subdomains only", () => {
  const domains = ["acme.com"];
  assert.equal(emailMatchesDomains("bob@acme.com", domains), true);
  assert.equal(emailMatchesDomains("bob@EU.Acme.com", domains), true);
  assert.equal(emailMatchesDomains("bob@notacme.com", domains), false);
  assert.equal(emailMatchesDomains("bob@acme.com.evil.io", domains), false);
  assert.equal(emailMatchesDomains("acme.com@evil.io", domains), false);
});

test("withDefaults fills in missing fields", () => {
  assert.deepEqual(withDefaults(undefined), DEFAULT_SETTINGS);
  const s = withDefaults({ branding: { appName: "Acme" } });
  assert.equal(s.branding.appName, "Acme");
  assert.equal(s.branding.footerText, "");
  assert.equal(s.policy.fileSharingEnabled, true);
  assert.equal(s.reports.monthlySummary, false);
});

test("validateReports needs a real boolean", () => {
  assert.deepEqual(validateReports({ monthlySummary: true }), { monthlySummary: true });
  assert.throws(() => validateReports({ monthlySummary: "yes" }), ValidationError);
  assert.throws(() => validateReports(null), ValidationError);
});

test("formatFromAddress encodes the display name", () => {
  assert.equal(formatFromAddress("", "a@b.com"), "a@b.com");
  const out = formatFromAddress('Acme "Secrets" ✓', "a@b.com");
  assert.match(out, /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <a@b\.com>$/);
  const encoded = out.slice("=?UTF-8?B?".length, out.indexOf("?= <"));
  assert.equal(Buffer.from(encoded, "base64").toString("utf8"), 'Acme "Secrets" ✓');
});
