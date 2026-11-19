output "user_pool_id" {
  value = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  value = aws_cognito_user_pool.this.arn
}

output "user_pool_client_id" {
  value = aws_cognito_user_pool_client.spa.id
}

output "user_pool_issuer" {
  description = "Issuer URL for API Gateway's JWT authorizer to validate tokens against."
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
}

output "hosted_ui_domain" {
  description = "Set as VITE_COGNITO_DOMAIN when building the frontend."
  value       = "${aws_cognito_user_pool_domain.this.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "idp_name" {
  description = "Set as VITE_COGNITO_IDP_NAME when building the frontend. Meaningless if no IdP is actually configured (var.oidc_client_id is blank) -- the frontend only uses this to skip the hosted UI's provider-chooser screen, which is moot with nothing to choose."
  value       = var.idp_name
}

output "oidc_redirect_uri" {
  description = "Give this exact URL to your identity provider's admin as the app registration's redirect URI, if not already set."
  value       = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${var.aws_region}.amazoncognito.com/oauth2/idpresponse"
}
