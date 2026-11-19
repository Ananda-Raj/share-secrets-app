data "aws_caller_identity" "current" {}

locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  # Centralized naming: <project>-<resource>-<environment>, e.g. secure-secrets-lambda-dev.
  # S3 bucket names are globally unique across all of AWS, so that one also gets the
  # account id appended.
  resource_name = {
    frontend_bucket     = "${var.project_name}-frontend-${var.environment}-${data.aws_caller_identity.current.account_id}"
    lambda              = "${var.project_name}-lambda-${var.environment}"
    api                 = "${var.project_name}-api-${var.environment}"
    table               = "${var.project_name}-table-${var.environment}"
    roles_table         = "${var.project_name}-roles-${var.environment}"
    audit_table         = "${var.project_name}-audit-${var.environment}"
    settings_table      = "${var.project_name}-settings-${var.environment}"
    budget              = "${var.project_name}-budget-${var.environment}"
    alerts              = "${var.project_name}-alerts-${var.environment}"
    github_actions_role = "${var.project_name}-github-actions-${var.environment}"
    user_pool           = "${var.project_name}-users-${var.environment}"
    user_pool_client    = "${var.project_name}-spa-${var.environment}"
    # Cognito hosted-UI domain prefixes are globally unique across all of AWS, like the
    # frontend S3 bucket name above, hence the account id suffix.
    cognito_domain = "${var.project_name}-${var.environment}-${data.aws_caller_identity.current.account_id}"
  }
}
