output "table_name" {
  value = aws_dynamodb_table.settings.name
}

output "table_arn" {
  value = aws_dynamodb_table.settings.arn
}
