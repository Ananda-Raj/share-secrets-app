module "github_oidc" {
  source = "./modules/github-oidc"

  role_name            = local.resource_name.github_actions_role
  github_repository    = var.github_repository
  create_oidc_provider = var.create_github_oidc_provider

  lambda_function_arn         = module.backend_api.function_arn
  frontend_bucket_arn         = module.frontend_hosting.bucket_arn
  cloudfront_distribution_arn = module.frontend_hosting.distribution_arn

  tags = local.common_tags
}
