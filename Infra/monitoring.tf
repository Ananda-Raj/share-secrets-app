module "monitoring" {
  source = "./modules/monitoring"

  name_prefix          = local.resource_name.alerts
  lambda_function_name = module.backend_api.function_name
  alert_emails         = var.monitoring_alert_emails

  tags = local.common_tags
}
