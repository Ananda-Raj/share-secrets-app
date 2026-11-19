variable "function_name" {
  type = string
}

variable "api_name" {
  type = string
}

variable "lambda_source_dir" {
  description = "Path to the built Lambda bundle directory (must contain index.js)."
  type        = string
}

variable "table_name" {
  type = string
}

variable "table_arn" {
  type = string
}

variable "roles_table_name" {
  type = string
}

variable "roles_table_arn" {
  type = string
}

variable "audit_table_name" {
  type = string
}

variable "audit_table_arn" {
  type = string
}

variable "cognito_client_id" {
  description = "Cognito app client id -- the audience the JWT authorizer checks incoming tokens against."
  type        = string
}

variable "cognito_issuer" {
  description = "Cognito user pool issuer URL -- the issuer the JWT authorizer checks incoming tokens against."
  type        = string
}

variable "user_pool_id" {
  description = "Cognito user pool id -- passed to the Lambda so lib/cognitoAdmin.ts can administer it at runtime (configuring an IdP, toggling self-signup, creating local accounts)."
  type        = string
}

variable "user_pool_client_id" {
  description = "Same value as cognito_client_id, passed under its own name since lib/cognitoAdmin.ts uses it for a different purpose (which app client to update) than the JWT authorizer does (audience to validate)."
  type        = string
}

variable "user_pool_arn" {
  description = "Scopes the Lambda's Cognito admin IAM permissions to this one user pool."
  type        = string
}

variable "frontend_origin" {
  description = "Exact scheme+host of the deployed frontend, e.g. https://d123.cloudfront.net — used for CORS and for links the backend emails."
  type        = string
}

variable "ses_sender_email" {
  type = string
}

variable "grace_seconds" {
  type = number
}

variable "otp_ttl_seconds" {
  type = number
}

variable "otp_max_attempts" {
  type = number
}

variable "log_retention_days" {
  # Real-time error checking plus the new Lambda-error alarm cover the normal case;
  # 14 days is a deliberate cap on CloudWatch Logs storage cost, not a guess -- going
  # further back than that hasn't been the actual way errors get investigated here.
  type    = number
  default = 14
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "settings_table_name" {
  type = string
}

variable "settings_table_arn" {
  type = string
}
