# The durable record of a share -- opposite security model from the secrets table
# (modules/secrets-table): that one's whole point is "deleted means gone forever", this
# one's whole point is "kept means kept". PITR is enabled here for exactly the reason
# it's disabled there.
resource "aws_dynamodb_table" "audit" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "secretId"

  attribute {
    name = "secretId"
    type = "S"
  }

  attribute {
    name = "senderEmail"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "N"
  }

  # "My history" (lib/audit.ts getHistoryForSender) queries this instead of scanning.
  global_secondary_index {
    name            = "sender-index"
    hash_key        = "senderEmail"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  # 1-year retention (createdAt + 365d, set by the application on write) -- matches the
  # retention period agreed with the user; TTL deletes are not instant but eventually
  # consistent, which is fine for a durable-but-not-permanent audit record.
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = var.tags
}
