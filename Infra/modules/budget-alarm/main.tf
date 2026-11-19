# Cheap insurance: this whole stack should cost a few dollars a month at most (see the
# README). An alert here catches a runaway loop, a misconfigured retry, or abuse early.
resource "aws_budgets_budget" "monthly" {
  name         = var.budget_name
  budget_type  = "COST"
  limit_amount = tostring(var.limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Without this filter, the budget tracks the ENTIRE account's spend (every other
  # thing running under this payer), not just what this stack created — format() is
  # used instead of "user:Project$${var.x}" string interpolation specifically to avoid
  # $-escaping ambiguity in Terraform's template syntax.
  cost_filter {
    name   = "TagKeyValue"
    values = [format("user:Project$%s", var.project_tag_value)]
  }

  dynamic "notification" {
    for_each = length(var.alert_emails) > 0 ? [1] : []
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = 80
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = var.alert_emails
    }
  }
}
