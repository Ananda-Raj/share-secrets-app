import { randomInt } from "node:crypto";
import {
  CognitoIdentityProviderClient,
  CreateIdentityProviderCommand,
  UpdateIdentityProviderCommand,
  DescribeIdentityProviderCommand,
  ListIdentityProvidersCommand,
  DescribeUserPoolClientCommand,
  UpdateUserPoolClientCommand,
  DescribeUserPoolCommand,
  UpdateUserPoolCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { config } from "./config.js";

const client = new CognitoIdentityProviderClient({});

// Cognito's reserved name for native username/password sign-in.
const NATIVE_PROVIDER = "COGNITO";

export interface OidcProviderConfig {
  idpName: string;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
}

async function identityProviderExists(idpName: string): Promise<boolean> {
  try {
    await client.send(new DescribeIdentityProviderCommand({ UserPoolId: config.userPoolId, ProviderName: idpName }));
    return true;
  } catch (err) {
    if ((err as { name?: string })?.name === "ResourceNotFoundException") return false;
    throw err;
  }
}

/** Runtime alternative to Terraform's static modules/auth wiring. Don't use both on the
 * same deployment -- they'd fight over the same Cognito resource. */
export async function upsertOidcProvider(cfg: OidcProviderConfig): Promise<void> {
  const providerDetails = {
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    oidc_issuer: cfg.issuerUrl,
    authorize_scopes: "openid email profile",
    attributes_request_method: "GET",
  };
  const attributeMapping = { email: "email" };

  if (await identityProviderExists(cfg.idpName)) {
    await client.send(
      new UpdateIdentityProviderCommand({
        UserPoolId: config.userPoolId,
        ProviderName: cfg.idpName,
        ProviderDetails: providerDetails,
        AttributeMapping: attributeMapping,
      })
    );
  } else {
    await client.send(
      new CreateIdentityProviderCommand({
        UserPoolId: config.userPoolId,
        ProviderName: cfg.idpName,
        ProviderType: "OIDC",
        ProviderDetails: providerDetails,
        AttributeMapping: attributeMapping,
      })
    );
  }

  // SupportedIdentityProviders is replaced wholesale, not merged -- read current first.
  const clientDesc = await client.send(
    new DescribeUserPoolClientCommand({ UserPoolId: config.userPoolId, ClientId: config.userPoolClientId })
  );
  const current = clientDesc.UserPoolClient?.SupportedIdentityProviders ?? [];
  if (!current.includes(cfg.idpName)) {
    await client.send(
      new UpdateUserPoolClientCommand({
        UserPoolId: config.userPoolId,
        ClientId: config.userPoolClientId,
        SupportedIdentityProviders: [...current, cfg.idpName],
        AllowedOAuthFlows: ["code"],
        AllowedOAuthScopes: ["openid", "email", "profile"],
        AllowedOAuthFlowsUserPoolClient: true,
        CallbackURLs: clientDesc.UserPoolClient?.CallbackURLs,
        LogoutURLs: clientDesc.UserPoolClient?.LogoutURLs,
      })
    );
  }
}

export interface AuthSettings {
  selfSignupEnabled: boolean;
  configuredIdps: string[];
}

export async function getAuthSettings(): Promise<AuthSettings> {
  const [poolDesc, idpList] = await Promise.all([
    client.send(new DescribeUserPoolCommand({ UserPoolId: config.userPoolId })),
    client.send(new ListIdentityProvidersCommand({ UserPoolId: config.userPoolId })),
  ]);
  return {
    selfSignupEnabled: poolDesc.UserPool?.AdminCreateUserConfig?.AllowAdminCreateUserOnly !== true,
    configuredIdps: (idpList.Providers ?? []).map((p) => p.ProviderName!).filter(Boolean),
  };
}

// UpdateUserPool resets any field you omit back to its default (unlike most AWS update
// APIs, including UpdateUserPoolClient below). AutoVerifiedAttributes, Policies, and
// DeviceConfiguration are the fields this pool's Terraform config customizes, so all
// three get read back and carried forward -- everything else was already at the default
// this would reset it to. (MfaConfiguration/SoftwareTokenMfaConfiguration are set via a
// separate Cognito API, not this one, so they're unaffected either way.)
export async function setSelfSignupEnabled(enabled: boolean): Promise<void> {
  const desc = await client.send(new DescribeUserPoolCommand({ UserPoolId: config.userPoolId }));
  await client.send(
    new UpdateUserPoolCommand({
      UserPoolId: config.userPoolId,
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: !enabled },
      AutoVerifiedAttributes: desc.UserPool?.AutoVerifiedAttributes,
      Policies: desc.UserPool?.Policies,
      DeviceConfiguration: desc.UserPool?.DeviceConfiguration,
    })
  );

  const clientDesc = await client.send(
    new DescribeUserPoolClientCommand({ UserPoolId: config.userPoolId, ClientId: config.userPoolClientId })
  );
  const current = clientDesc.UserPoolClient?.SupportedIdentityProviders ?? [];
  const withNative = enabled
    ? [...new Set([...current, NATIVE_PROVIDER])]
    : current.filter((p) => p !== NATIVE_PROVIDER);
  await client.send(
    new UpdateUserPoolClientCommand({
      UserPoolId: config.userPoolId,
      ClientId: config.userPoolClientId,
      SupportedIdentityProviders: withNative,
      AllowedOAuthFlows: ["code"],
      AllowedOAuthScopes: ["openid", "email", "profile"],
      AllowedOAuthFlowsUserPoolClient: true,
      CallbackURLs: clientDesc.UserPoolClient?.CallbackURLs,
      LogoutURLs: clientDesc.UserPoolClient?.LogoutURLs,
    })
  );
}

/** Guarantees Cognito's default password policy by construction, not chance. */
function generateTemporaryPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O -- avoids visual ambiguity
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const all = upper + lower + digits + symbols;
  const pick = (chars: string) => chars[randomInt(0, chars.length)];

  const combined = [pick(upper), pick(lower), pick(digits), pick(symbols), ...Array.from({ length: 12 }, () => pick(all))];
  for (let i = combined.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return combined.join("");
}

export class EmailConflictError extends Error {}

/** For someone without IdP access (e.g. a contractor). Temporary password is returned
 * once for the admin to relay out of band -- never stored here.
 *
 * Checks for an existing account (SSO or local) with this email first: Cognito enforces
 * email uniqueness pool-wide regardless of source, and its own rejection
 * (AliasExistsException) is a confusing error to surface as-is. A local account created
 * for someone who already has (or later gets) an SSO identity under the same email is
 * exactly the scenario this guards against. */
export async function createLocalUser(email: string): Promise<{ temporaryPassword: string }> {
  const existing = await listUsers();
  if (existing.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new EmailConflictError(`An account with email ${email} already exists`);
  }

  const temporaryPassword = generateTemporaryPassword();
  await client.send(
    new AdminCreateUserCommand({
      UserPoolId: config.userPoolId,
      Username: email,
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" },
      ],
      TemporaryPassword: temporaryPassword,
      MessageAction: "SUPPRESS",
    })
  );
  return { temporaryPassword };
}

export interface CognitoUserSummary {
  // Cognito's real internal identifier -- for a federated user this is NOT their email
  // (it's "<providerName>_<sub>"), so AdminDeleteUser needs this, not the email below.
  username: string;
  email: string;
  status: string;
  enabled: boolean;
  isFederated: boolean;
  createdAt: string;
}

/** A federated user carries Cognito's own "identities" attribute; a local account
 * doesn't -- more reliable than parsing the username for a provider-name prefix. */
export async function listUsers(): Promise<CognitoUserSummary[]> {
  const users: CognitoUserSummary[] = [];
  let paginationToken: string | undefined;
  do {
    const res = await client.send(
      new ListUsersCommand({ UserPoolId: config.userPoolId, PaginationToken: paginationToken })
    );
    for (const u of res.Users ?? []) {
      const attrs = Object.fromEntries((u.Attributes ?? []).map((a) => [a.Name, a.Value]));
      users.push({
        username: u.Username ?? "",
        email: attrs.email ?? u.Username ?? "unknown",
        status: u.UserStatus ?? "UNKNOWN",
        enabled: u.Enabled ?? true,
        isFederated: "identities" in attrs,
        createdAt: u.UserCreateDate?.toISOString() ?? "",
      });
    }
    paginationToken = res.PaginationToken;
  } while (paginationToken);
  return users;
}

/** Removing a federated user only clears their Cognito shadow record -- the IdP
 * still lets them back in, and Cognito just re-provisions on next login.
 * Only meaningful revocation for a local account. Self-removal is blocked by the caller. */
export async function deleteUser(username: string): Promise<void> {
  await client.send(new AdminDeleteUserCommand({ UserPoolId: config.userPoolId, Username: username }));
}
