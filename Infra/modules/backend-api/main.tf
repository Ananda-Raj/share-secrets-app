# One Lambda ("lambdalith") behind an HTTP API, routed internally by src/index.ts — see
# App-code/backend for why: six small routes don't justify six functions' worth of cold
# starts and Terraform resources.

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = var.lambda_source_dir
  output_path = "${path.module}/build/lambda.zip"
}

resource "aws_iam_role" "lambda_exec" {
  name = "${var.function_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "lambda_basic_logs" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Least privilege: only the exact DynamoDB item operations the handlers use, scoped to
# this one table, and only the ability to send from the one verified SES identity.
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  ses_identities_arn = "arn:aws:ses:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:identity/*"
}

data "aws_iam_policy_document" "lambda_permissions" {
  statement {
    sid    = "DynamoDbAccess"
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:GetItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
    ]
    resources = [var.table_arn]
  }

  # GetItem for the role check, Scan to list admins, PutItem for the first-admin
  # bootstrap and promote/demote (lib/roles.ts). No DeleteItem: demoting writes
  # role "user" instead. Safeguards for role changes are in handlers/adminSetRole.ts.
  statement {
    sid       = "RolesTableAccess"
    effect    = "Allow"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Scan"]
    resources = [var.roles_table_arn]
  }

  # No DeleteItem: the audit table is an append/update-only durable record (see
  # modules/audit-table) -- nothing in the application ever deletes a row directly,
  # cleanup is entirely via the table's own TTL attribute.
  statement {
    sid    = "AuditTableReadWrite"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [var.audit_table_arn, "${var.audit_table_arn}/index/*"]
  }

  # Admin settings: read on most requests, written only by admin endpoints.
  statement {
    sid       = "SettingsTableAccess"
    effect    = "Allow"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem"]
    resources = [var.settings_table_arn]
  }

  # Scoped to this one user pool -- used only by lib/cognitoAdmin.ts's admin endpoints.
  statement {
    sid    = "CognitoAdmin"
    effect = "Allow"
    actions = [
      "cognito-idp:CreateIdentityProvider",
      "cognito-idp:UpdateIdentityProvider",
      "cognito-idp:DescribeIdentityProvider",
      "cognito-idp:ListIdentityProviders",
      "cognito-idp:DescribeUserPoolClient",
      "cognito-idp:UpdateUserPoolClient",
      "cognito-idp:DescribeUserPool",
      "cognito-idp:UpdateUserPool",
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminDeleteUser",
      "cognito-idp:ListUsers",
    ]
    resources = [var.user_pool_arn]
  }

  statement {
    # SES checks every identity involved: the sender's address or domain, and in the
    # sandbox each verified recipient too. So the resource covers this account's
    # identities, and ses:FromAddress limits sending to this project's own address.
    #
    # ses:SendEmail is needed even though the code uses the SESv2 client; SES
    # authorizes that call under the classic action. Don't remove it.
    sid       = "SesSend"
    effect    = "Allow"
    actions   = ["ses:SendEmail", "sesv2:SendEmail"]
    resources = [local.ses_identities_arn]

    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [var.ses_sender_email]
    }
  }
}

resource "aws_iam_role_policy" "lambda_permissions" {
  name   = "${var.function_name}-permissions"
  role   = aws_iam_role.lambda_exec.id
  policy = data.aws_iam_policy_document.lambda_permissions.json
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_function" "api" {
  function_name    = var.function_name
  role             = aws_iam_role.lambda_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs24.x" # keep in step with target in App-code/backend/build.mjs
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  timeout          = 10
  # Lambda allocates CPU proportionally to memory -- 256MB was fine for the original
  # handful of DynamoDB/SES calls, but cold starts now also construct a Cognito SDK
  # client for the admin auth-settings endpoints. Bumped for faster cold starts and
  # execution generally, not because the bundle itself is large (it isn't -- ~24KB).
  memory_size = 512

  environment {
    variables = {
      TABLE_NAME          = var.table_name
      FRONTEND_ORIGIN     = var.frontend_origin
      SES_SENDER_EMAIL    = var.ses_sender_email
      GRACE_SECONDS       = tostring(var.grace_seconds)
      OTP_TTL_SECONDS     = tostring(var.otp_ttl_seconds)
      OTP_MAX_ATTEMPTS    = tostring(var.otp_max_attempts)
      ROLES_TABLE_NAME    = var.roles_table_name
      AUDIT_TABLE_NAME    = var.audit_table_name
      SETTINGS_TABLE_NAME = var.settings_table_name
      USER_POOL_ID        = var.user_pool_id
      USER_POOL_CLIENT_ID = var.user_pool_client_id
    }
  }

  tags = var.tags

  depends_on = [aws_cloudwatch_log_group.lambda, aws_iam_role_policy.lambda_permissions]
}

resource "aws_apigatewayv2_api" "this" {
  name          = var.api_name
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = [var.frontend_origin]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
  }

  tags = var.tags
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

# Sender-facing routes require a valid Cognito-issued JWT (checked entirely by API
# Gateway before Lambda ever runs -- see aws_apigatewayv2_authorizer below); receiver
# facing routes stay open, since receivers never log in and are gated by the OTP itself.
locals {
  routes = {
    "POST /secrets"                 = { protected = true }
    "GET /secrets/{id}/meta"        = { protected = false }
    "POST /secrets/{id}/verify-otp" = { protected = false }
    "POST /secrets/{id}/confirm"    = { protected = false }
    "POST /secrets/{id}/resend"     = { protected = false }
    "POST /secrets/{id}/revoke"     = { protected = true }
    "GET /my/history"               = { protected = true }
    "GET /admin/audit"              = { protected = true }
    "GET /admin/stats"              = { protected = true }
    "GET /me"                       = { protected = true }
    "GET /admin/auth-settings"      = { protected = true }
    "POST /admin/auth-settings"     = { protected = true }
    "POST /admin/idp"               = { protected = true }
    "POST /admin/users"             = { protected = true }
    "GET /admin/users"              = { protected = true }
    "POST /admin/users/remove"      = { protected = true }
    "POST /admin/users/role"        = { protected = true }
    "GET /auth-config"              = { protected = false }
    "GET /branding"                 = { protected = false }
    "GET /admin/settings"           = { protected = true }
    "POST /admin/settings"          = { protected = true }
    "POST /admin/summary/preview"   = { protected = true }
  }
}

# Native HTTP API JWT authorizer: validates signature/issuer/audience/expiry before the
# request reaches Lambda. Deliberately no hand-rolled token verification in application
# code -- that's exactly the kind of security-critical logic (signature checks, key
# rotation) best left to a feature AWS already implements correctly.
resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.this.id
  name             = "${var.function_name}-jwt"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    audience = [var.cognito_client_id]
    issuer   = var.cognito_issuer
  }
}

resource "aws_apigatewayv2_route" "routes" {
  for_each  = local.routes
  api_id    = aws_apigatewayv2_api.this.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"

  authorization_type = each.value.protected ? "JWT" : "NONE"
  authorizer_id      = each.value.protected ? aws_apigatewayv2_authorizer.jwt.id : null
}

# Free, built-in abuse mitigation — no WAF needed for this threat model (see
# Doc/design.md): 128-bit random secret ids are infeasible to guess regardless of rate, and
# OTP brute force is separately capped server-side at otp_max_attempts.
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }

  tags = var.tags
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

# Monthly admin summary, 08:00 UTC on the 1st. The Lambda skips it unless an admin turned it on.
resource "aws_cloudwatch_event_rule" "monthly_summary" {
  name                = "${var.function_name}-monthly-summary"
  description         = "Monthly activity summary email to admins"
  schedule_expression = "cron(0 8 1 * ? *)"
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "monthly_summary" {
  rule  = aws_cloudwatch_event_rule.monthly_summary.name
  arn   = aws_lambda_function.api.arn
  input = jsonencode({ task = "monthly-summary" })
}

resource "aws_lambda_permission" "monthly_summary" {
  statement_id  = "AllowMonthlySummarySchedule"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.monthly_summary.arn
}
