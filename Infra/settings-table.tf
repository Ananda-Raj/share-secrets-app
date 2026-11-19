module "settings_table" {
  source = "./modules/settings-table"

  table_name = local.resource_name.settings_table
  tags       = local.common_tags
}
