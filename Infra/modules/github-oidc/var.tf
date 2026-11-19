variable "role_name" {
  type = string
}

variable "github_repository" {
  description = "GitHub \"org/repo\" allowed to assume this role, e.g. \"acme/secure-secrets\". Empty leaves the trust policy pointed at a placeholder that can't actually assume it."
  type        = string
  default     = ""
}

variable "create_oidc_provider" {
  description = "Whether to create the GitHub Actions OIDC provider. It's an AWS-account-wide singleton (one per URL, shared across every repo/role using it), so set this to false if the account already has one from another project — true is the right default for a fresh account."
  type        = bool
  default     = true
}

# Scoped to exactly the resources deploy-backend.yml/deploy-frontend.yml touch. This
# role is assumable by any workflow_dispatch run on the repo (see github_sub_patterns in
# main.tf) -- a much lower bar than AWS account access -- so it must never be broader than
# those two workflows' actual `aws` CLI calls, even though Terraform itself needs far
# more permissions than this. Terraform runs locally under a human's own credentials,
# never through this role (see Doc/deployment.md).
variable "lambda_function_arn" {
  type = string
}

variable "frontend_bucket_arn" {
  type = string
}

variable "cloudfront_distribution_arn" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
