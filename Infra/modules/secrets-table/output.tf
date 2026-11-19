output "table_name" {
  value = aws_dynamodb_table.secrets.name
}

output "table_arn" {
  value = aws_dynamodb_table.secrets.arn
}
