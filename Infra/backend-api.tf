module "backend_api" {
  source = "./modules/backend-api"

  function_name     = local.resource_name.lambda
  api_name          = local.resource_name.api
  lambda_source_dir = var.lambda_source_dir

  table_name = module.secrets_table.table_name
  table_arn  = module.secrets_table.table_arn

  roles_table_name = module.roles_table.table_name
  roles_table_arn  = module.roles_table.table_arn
  audit_table_name = module.audit_table.table_name
  audit_table_arn  = module.audit_table.table_arn

  settings_table_name = module.settings_table.table_name
  settings_table_arn  = module.settings_table.table_arn

  cognito_client_id = module.auth.user_pool_client_id
  cognito_issuer    = module.auth.user_pool_issuer

  user_pool_id        = module.auth.user_pool_id
  user_pool_client_id = module.auth.user_pool_client_id
  user_pool_arn       = module.auth.user_pool_arn

  frontend_origin  = module.frontend_hosting.frontend_url
  ses_sender_email = var.ses_sender_email
  ses_identity_arn = module.email.sender_email_identity_arn

  grace_seconds    = var.grace_period_seconds
  otp_ttl_seconds  = var.otp_ttl_seconds
  otp_max_attempts = var.otp_max_attempts

  tags = local.common_tags
}
