output "bucket_name" {
  value = aws_s3_bucket.frontend.id
}

output "bucket_arn" {
  value = aws_s3_bucket.frontend.arn
}

output "distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "distribution_arn" {
  value = aws_cloudfront_distribution.frontend.arn
}

output "distribution_domain_name" {
  value = aws_cloudfront_distribution.frontend.domain_name
}

output "frontend_url" {
  value = var.domain_name != "" ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.frontend.domain_name}"
}
