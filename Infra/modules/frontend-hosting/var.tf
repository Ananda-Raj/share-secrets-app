variable "bucket_name" {
  description = "S3 bucket name for the built frontend assets."
  type        = string
}

variable "domain_name" {
  description = "Custom domain for the frontend. Empty string uses the default CloudFront domain."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN (us-east-1), required only when domain_name is set."
  type        = string
  default     = ""
}

variable "api_region" {
  description = "Region the backend API Gateway runs in, used to build the CSP connect-src allowance. CSP host-source syntax only permits a single wildcard, and only as the leading label (e.g. \"*.example.com\") — a second wildcard for the region as well is invalid and gets silently dropped by browsers, so the region has to be a concrete value here rather than another wildcard."
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
