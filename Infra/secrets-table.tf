module "secrets_table" {
  source = "./modules/secrets-table"

  table_name = local.resource_name.table
  tags       = local.common_tags
}
