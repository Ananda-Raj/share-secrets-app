# On-demand billing: no capacity to plan for, cost tracks actual usage (near-zero at low
# volume). Native TTL on `expiresAt` is the backstop that guarantees cleanup even if the
# application logic never explicitly deletes a record.
resource "aws_dynamodb_table" "secrets" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  # Deliberately no point-in-time recovery: this table's whole security model rests on
  # "deleted means gone" (burn-after-read, OTP lockout burns). PITR would let anyone with
  # backup-restore access resurrect a secret that was supposed to be destroyed, which
  # would undermine that guarantee.
  point_in_time_recovery {
    enabled = false
  }

  server_side_encryption {
    enabled = true
  }

  tags = var.tags
}
