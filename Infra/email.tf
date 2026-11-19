module "email" {
  source = "./modules/email"

  sender_email = var.ses_sender_email
  tags         = local.common_tags
}
