# Tiny, low-churn table: PK email -> role. Absence of a row means "user" (see
# lib/roles.ts) -- only admins ever get a row here. Bootstrapping the first admin is a
# deliberate one-time manual `aws dynamodb put-item`, never a Terraform resource, so a
# routine apply can never silently change who's an admin.
resource "aws_dynamodb_table" "roles" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"

  attribute {
    name = "email"
    type = "S"
  }

  # Unlike the secrets table, this one should survive an accidental delete -- it's an
  # access-control record, not something with a "burn after read" model.
  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = var.tags
}
