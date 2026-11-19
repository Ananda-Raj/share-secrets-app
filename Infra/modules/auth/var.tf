variable "user_pool_name" {
  type = string
}

variable "client_name" {
  type = string
}

variable "domain_prefix" {
  description = "Prefix for the Cognito hosted UI domain (<prefix>.auth.<region>.amazoncognito.com). Must be globally unique and match Cognito's domain naming rules (lowercase letters, digits, hyphens)."
  type        = string
}

variable "aws_region" {
  type = string
}

variable "callback_urls" {
  description = "Allowed OAuth redirect URIs after login, e.g. [\"https://secrets.example.com/callback\"]."
  type        = list(string)
}

variable "logout_urls" {
  description = "Allowed redirect URIs after logout."
  type        = list(string)
}

variable "idp_name" {
  description = "Name Cognito uses internally for this OIDC connection -- exposed as VITE_COGNITO_IDP_NAME to skip the hosted UI's provider-chooser screen."
  type        = string
}

# Works with any standard OIDC provider -- Cognito reads authorize/token/jwks URLs from
# oidc_issuer_url's own discovery document.
variable "oidc_issuer_url" {
  description = "Full OIDC issuer URL, e.g. \"https://login.microsoftonline.com/<tenant-id>/v2.0\". Leave blank to start with no IdP (requires allow_self_signup=true)."
  type        = string
  default     = ""
}

variable "oidc_client_id" {
  description = "Client id from your identity provider. Leave blank to start with no IdP (requires allow_self_signup=true)."
  type        = string
  default     = ""
}

variable "oidc_client_secret" {
  description = "Client secret from your identity provider -- never reaches the frontend."
  type        = string
  default     = ""
  sensitive   = true
}

variable "allow_self_signup" {
  description = "Allows native username/password self-registration alongside any federated IdP. First-ever login becomes admin automatically regardless (see lib/roles.ts's ensureFirstAdmin)."
  type        = bool
  default     = false
}

variable "tags" {
  type    = map(string)
  default = {}
}
