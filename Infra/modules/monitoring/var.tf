variable "name_prefix" {
  description = "Prefix for the SNS topic and every alarm name, e.g. \"secure-secrets-alerts-prod\"."
  type        = string
}

variable "lambda_function_name" {
  type = string
}

variable "alert_emails" {
  description = "Notified on any Lambda error or SES bounce/complaint. Empty list means the alarms still exist but have no subscriber."
  type        = list(string)
  default     = []
}

variable "tags" {
  type    = map(string)
  default = {}
}
