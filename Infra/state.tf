# Bucket is set at init time, so no account-specific value lives in git:
#   terraform init -backend-config="bucket=<your-state-bucket>"
# Credentials come from AWS_PROFILE, or add -backend-config="profile=<name>".
terraform {
  backend "s3" {
    key          = "secure-secrets/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
