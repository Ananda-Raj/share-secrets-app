module "budget_alarm" {
  source = "./modules/budget-alarm"

  budget_name       = local.resource_name.budget
  limit_usd         = var.budget_limit_usd
  alert_emails      = var.budget_alert_emails
  project_tag_value = var.project_name
}
