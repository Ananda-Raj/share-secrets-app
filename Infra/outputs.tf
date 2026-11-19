output "frontend_url" {
  description = "Public URL of the frontend."
  value       = module.frontend_hosting.frontend_url
}

output "frontend_bucket_name" {
  description = "S3 bucket to sync the built frontend into."
  value       = module.frontend_hosting.bucket_name
}

output "cloudfront_distribution_id" {
  description = "Used to invalidate the CloudFront cache after a frontend deploy."
  value       = module.frontend_hosting.distribution_id
}

output "cloudfront_distribution_domain_name" {
  description = "The dXXXX.cloudfront.net hostname to point frontend_domain_name's DNS at (an alias/A record if using Route 53, or the equivalent elsewhere) — this repo does not manage DNS itself, see Doc/deployment.md."
  value       = module.frontend_hosting.distribution_domain_name
}

output "api_base_url" {
  description = "Backend API base URL — set this as VITE_API_BASE_URL when building the frontend."
  value       = module.backend_api.api_base_url
}

output "backend_function_name" {
  description = "Lambda function name, used to push code updates without a full terraform apply."
  value       = module.backend_api.function_name
}

output "secrets_table_name" {
  value = module.secrets_table.table_name
}

output "roles_table_name" {
  description = "Used for the one-time bootstrap-the-first-admin `aws dynamodb put-item` (see Doc/deployment.md) — never managed by Terraform itself."
  value       = module.roles_table.table_name
}

output "audit_table_name" {
  value = module.audit_table.table_name
}

output "settings_table_name" {
  value = module.settings_table.table_name
}

output "cognito_domain" {
  description = "Set as VITE_COGNITO_DOMAIN when building the frontend."
  value       = module.auth.hosted_ui_domain
}

output "cognito_client_id" {
  description = "Set as VITE_COGNITO_CLIENT_ID when building the frontend."
  value       = module.auth.user_pool_client_id
}

output "cognito_idp_name" {
  description = "Set as VITE_COGNITO_IDP_NAME when building the frontend."
  value       = module.auth.idp_name
}

output "oidc_redirect_uri" {
  description = "Give this to your identity provider's admin as the app registration's redirect URI, if it isn't already set to this exact value."
  value       = module.auth.oidc_redirect_uri
}

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions to assume via OIDC — set as the AWS_DEPLOY_ROLE_ARN GitHub secret."
  value       = module.github_oidc.role_arn
}
