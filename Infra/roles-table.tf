module "roles_table" {
  source = "./modules/roles-table"

  table_name = local.resource_name.roles_table
  tags       = local.common_tags
}
