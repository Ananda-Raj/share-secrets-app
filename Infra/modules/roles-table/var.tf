variable "table_name" {
  description = "DynamoDB table name."
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
