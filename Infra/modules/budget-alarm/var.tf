variable "budget_name" {
  type = string
}

variable "limit_usd" {
  type = number
}

variable "alert_emails" {
  description = "Notified when spend crosses 80% of limit_usd. Empty list disables the notification."
  type        = list(string)
  default     = []
}

variable "project_tag_value" {
  description = "Value of the Project tag (from default_tags) that every resource this stack creates gets. Used to scope the budget to just this stack's spend — without it, AWS Budgets tracks the entire AWS account/payer, which is almost never what you want in an account that runs other, unrelated infrastructure too."
  type        = string
}
