module "frontend_hosting" {
  source = "./modules/frontend-hosting"

  bucket_name         = local.resource_name.frontend_bucket
  domain_name         = var.frontend_domain_name
  acm_certificate_arn = var.acm_certificate_arn
  api_region          = var.aws_region
  tags                = local.common_tags
}
