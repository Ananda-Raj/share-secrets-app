# Frontend never sees the IdP's own client id/secret, only Cognito's hosted UI + this
# pool's own public app client id. Issuing its own JWTs is what lets API Gateway's JWT
# authorizer (modules/backend-api) validate requests with no token-verification code.
resource "aws_cognito_user_pool" "this" {
  name = var.user_pool_name

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Initial value only -- once deployed, this is meant to be toggled live from the
  # Admin page's "Auth settings" tab (see Doc/design.md), not re-asserted by Terraform.
  # Without ignore_changes, a routine apply would silently revert that toggle back to
  # allow_self_signup's value, undoing whatever an admin set at runtime.
  admin_create_user_config {
    allow_admin_create_user_only = !var.allow_self_signup
  }

  lifecycle {
    ignore_changes = [admin_create_user_config]
  }

  # TOTP, optional per-user. Only gates native username/password login -- a federated
  # SSO sign-in is already authenticated by the IdP before Cognito ever sees it.
  mfa_configuration = "OPTIONAL"
  software_token_mfa_configuration {
    enabled = true
  }

  # Hosted UI prompts "remember this device?" after a successful MFA challenge; a
  # remembered device skips MFA on later logins, an unrecognized one is challenged again.
  device_configuration {
    challenge_required_on_new_device      = true
    device_only_remembered_on_user_prompt = true
  }

  tags = var.tags
}

# Optional: no IdP exists until oidc_client_id is set, either here or later via the
# admin UI's runtime path (lib/cognitoAdmin.ts). Don't use both on one deployment --
# whichever runs last overwrites the other's view of this resource.
resource "aws_cognito_identity_provider" "entra" {
  count = var.oidc_client_id != "" ? 1 : 0

  user_pool_id  = aws_cognito_user_pool.this.id
  provider_name = var.idp_name
  provider_type = "OIDC"

  provider_details = {
    client_id                     = var.oidc_client_id
    client_secret                 = var.oidc_client_secret
    oidc_issuer                   = var.oidc_issuer_url
    authorize_scopes              = "openid email profile"
    attributes_request_method     = "GET"
    attributes_url_add_attributes = "false"
  }

  # oidc_issuer_url must publish a standard OIDC discovery document -- Cognito reads
  # authorize/token/jwks URLs from it automatically. username=sub keeps each federated
  # user's Cognito username stable across logins -- do not drop this mapping, removing
  # it risks Cognito deriving a different username on next login and splitting an
  # existing user's identity (and their secret history) onto a new record.
  attribute_mapping = {
    email    = "email"
    username = "sub"
  }
}

# Public SPA client (no secret -- PKCE is the protection, see App-code/frontend
# src/auth.ts). Can offer native sign-in and a federated IdP at the same time.
resource "aws_cognito_user_pool_client" "spa" {
  name         = var.client_name
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  # Native login is always offered, independent of allow_self_signup -- that variable
  # only gates the public sign-up form, not whether an already-created (e.g.
  # admin-created) native account can log in.
  supported_identity_providers = concat(
    ["COGNITO"],
    length(aws_cognito_identity_provider.entra) > 0 ? [aws_cognito_identity_provider.entra[0].provider_name] : []
  )

  # Avoids leaking via error-message differences whether a given email has an account.
  prevent_user_existence_errors = "ENABLED"

  lifecycle {
    precondition {
      condition     = var.allow_self_signup || var.oidc_client_id != ""
      error_message = "No way to log in: set allow_self_signup=true, or set oidc_client_id/oidc_issuer_url/oidc_client_secret, or configure an IdP later via the admin UI after applying with allow_self_signup=true temporarily."
    }
  }
}

# Cognito-prefix hosted domain -- no custom-domain ACM cert/DNS to manage just for the
# login screen. The prefix must be globally unique across all AWS accounts using
# Cognito, hence the account id suffix (same reasoning as the frontend S3 bucket name).
resource "aws_cognito_user_pool_domain" "this" {
  domain       = var.domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}
