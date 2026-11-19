variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "Named AWS CLI/SSO profile for the aws provider to use (e.g. from `aws configure sso`). Leave empty to fall back to the default credential chain (env vars, default profile, instance role, etc.) — this is what GitHub Actions' OIDC-issued credentials rely on, so leave it blank there."
  type        = string
  default     = ""
}

variable "environment" {
  description = "Deployment environment name, used in every resource name (e.g. dev, staging, prod)."
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Short project name used as the prefix for all resource names."
  type        = string
  default     = "secure-secrets"
}

variable "frontend_domain_name" {
  description = "Custom domain for the frontend (e.g. secrets.example.com). Leave empty to use the default CloudFront domain for now."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN (must be in us-east-1) for frontend_domain_name. Only required once frontend_domain_name is set."
  type        = string
  default     = ""
}

variable "ses_sender_email" {
  description = "Verified SES sender address used for OTP/link emails."
  type        = string
  default     = "secrets@yourdomain.com"
}

variable "secret_min_ttl_seconds" {
  description = "Minimum allowed secret lifetime, enforced by the backend."
  type        = number
  default     = 300
}

variable "secret_max_ttl_seconds" {
  description = "Maximum allowed secret lifetime, enforced by the backend."
  type        = number
  default     = 604800
}

variable "grace_period_seconds" {
  description = "How long a claimed-but-unconfirmed secret survives before hard expiry (see Doc/design.md)."
  type        = number
  default     = 300
}

variable "otp_ttl_seconds" {
  description = "How long an emailed OTP remains valid."
  type        = number
  default     = 600
}

variable "otp_max_attempts" {
  description = "Max incorrect OTP attempts before a secret is burned."
  type        = number
  default     = 5
}

variable "lambda_source_dir" {
  description = "Path to the built backend Lambda bundle (output of `npm run build` in App-code/backend)."
  type        = string
  default     = "../App-code/backend/dist"
}

variable "budget_limit_usd" {
  description = "Monthly AWS budget threshold that triggers an alert."
  type        = number
  default     = 5
}

variable "budget_alert_emails" {
  description = "Email addresses notified when the budget threshold is breached. Leave empty to disable the notification."
  type        = list(string)
  default     = []
}

variable "monitoring_alert_emails" {
  description = "Email addresses notified on a backend Lambda error or an SES bounce/complaint. Leave empty to disable these alerts. Separate from budget_alert_emails so the two can diverge later; set to the same list for now."
  type        = list(string)
  default     = []
}

variable "github_repository" {
  description = "GitHub \"org/repo\" allowed to assume the deploy role via OIDC, e.g. \"acme/secure-secrets\". Leave empty until the repo exists."
  type        = string
  default     = ""
}

variable "create_github_oidc_provider" {
  description = "Whether to create the GitHub Actions OIDC provider in this account. It's an account-wide singleton (one per URL, shared across every repo/role using it) — set to false if this AWS account already has one from another project, otherwise `terraform apply` fails with EntityAlreadyExists. True is the right default for a fresh account."
  type        = bool
  default     = true
}

# --- SSO via any standard OIDC provider (see modules/auth) ---
# Works with Entra ID, Okta, Google Workspace, Auth0, Keycloak, or anything else that
# publishes a standard OIDC discovery document. Set these in terraform.tfvars
# (gitignored) — never commit real values.

variable "oidc_issuer_url" {
  description = "Full OIDC issuer URL from your identity provider, e.g. \"https://login.microsoftonline.com/<tenant-id>/v2.0\" for Entra ID, \"https://accounts.google.com\" for Google, or your Okta/Auth0/Keycloak issuer."
  type        = string
  default     = ""
}

variable "oidc_client_id" {
  description = "Client (application) id from your identity provider's app registration/client."
  type        = string
  default     = ""
}

variable "oidc_client_secret" {
  description = "Client secret value from your identity provider. Stored only in Cognito's identity provider config; the frontend never sees it."
  type        = string
  default     = ""
  sensitive   = true
}

variable "oidc_idp_name" {
  description = "Name Cognito uses internally for this SSO connection. Flows through to the frontend as VITE_COGNITO_IDP_NAME — no need to keep the two in sync by hand."
  type        = string
  default     = "CompanySSO"
}

variable "allow_self_signup" {
  description = "Allows anyone to self-register with native username/password, alongside any federated SSO configured above. Off by default. See modules/auth/var.tf for the full reasoning (OSS deployments with no enterprise IdP, or admin-created local accounts, both need this understood correctly)."
  type        = bool
  default     = false
}
