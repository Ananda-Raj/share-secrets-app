module "audit_table" {
  source = "./modules/audit-table"

  table_name = local.resource_name.audit_table
  tags       = local.common_tags
}
