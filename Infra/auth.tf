module "auth" {
  source = "./modules/auth"

  user_pool_name = local.resource_name.user_pool
  client_name    = local.resource_name.user_pool_client
  domain_prefix  = local.resource_name.cognito_domain
  aws_region     = var.aws_region

  callback_urls = ["${module.frontend_hosting.frontend_url}/callback"]
  logout_urls   = [module.frontend_hosting.frontend_url]

  oidc_issuer_url    = var.oidc_issuer_url
  oidc_client_id     = var.oidc_client_id
  oidc_client_secret = var.oidc_client_secret
  idp_name           = var.oidc_idp_name
  allow_self_signup  = var.allow_self_signup

  tags = local.common_tags
}
