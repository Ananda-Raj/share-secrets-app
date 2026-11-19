# One shared topic for every alert here -- cheap insurance (SNS + CloudWatch alarms are
# a few cents a month at this volume) that catches exactly the two failure classes this
# app can fail silently in: a backend error nobody's watching for, and an email that
# bounced/got reported as spam with no one ever told (see the README's Cost section).
resource "aws_sns_topic" "alerts" {
  name = var.name_prefix
  tags = var.tags
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

# Any error at all is worth a look at this volume (an internal tool, not a high-traffic
# service) -- a single error in a 5-minute window is enough to notify.
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${var.name_prefix}-lambda-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  dimensions = {
    FunctionName = var.lambda_function_name
  }
  alarm_description  = "The backend Lambda threw at least one error in the last 5 minutes."
  treat_missing_data = "notBreaching"
  alarm_actions      = [aws_sns_topic.alerts.arn]
  tags               = var.tags
}

# Account-level SES metrics -- no configuration set needed, but that also means these
# fire for ANY bounce/complaint on this AWS account's SES sending, not just this app's.
# There's no narrower per-app SES metric without adding a configuration set, which this
# app's single sender identity doesn't use.
resource "aws_cloudwatch_metric_alarm" "ses_bounce" {
  alarm_name          = "${var.name_prefix}-ses-bounce"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Bounce"
  namespace           = "AWS/SES"
  period              = 3600
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "At least one SES bounce in the last hour (account-wide SES metric, not scoped to this app alone)."
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "ses_complaint" {
  alarm_name          = "${var.name_prefix}-ses-complaint"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Complaint"
  namespace           = "AWS/SES"
  period              = 3600
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "At least one SES complaint (spam report) in the last hour (account-wide SES metric)."
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}
