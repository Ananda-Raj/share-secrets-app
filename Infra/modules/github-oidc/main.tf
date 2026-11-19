# Lets GitHub Actions deploy without any long-lived AWS access keys stored as secrets:
# the workflow exchanges a short-lived, repo-scoped OIDC token for temporary credentials
# by assuming this role. Thumbprint is fetched dynamically rather than hardcoded.
#
# The OIDC provider itself is an AWS-account-wide singleton — only one can exist per
# URL, shared across every repo/role that uses it — so it's created only when
# var.create_oidc_provider is true (the right default for a fresh account). An account
# that already runs other GitHub-Actions-via-OIDC projects (like this one) should set
# it to false, in which case the existing provider is just looked up and reused. This
# also matters beyond the create-time conflict: if this module owned a provider that's
# actually shared with other projects, a `terraform destroy` of just this stack would
# delete it out from under them.

data "tls_certificate" "github" {
  count = var.create_oidc_provider ? 1 : 0
  url   = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github[0].certificates[0].sha1_fingerprint]

  tags = var.tags
}

data "aws_iam_openid_connect_provider" "existing" {
  count = var.create_oidc_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  oidc_provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.existing[0].arn

  # GitHub sends either "repo:org/repo:..." or "repo:org@<id>/repo@<id>:...".
  # Names must match exactly, so a look-alike owner (e.g. "org-x") can't assume the role.
  github_repo_parts = split("/", var.github_repository != "" ? var.github_repository : "PLACEHOLDER/PLACEHOLDER")
  github_sub_patterns = [
    "repo:${local.github_repo_parts[0]}/${local.github_repo_parts[1]}:*",
    "repo:${local.github_repo_parts[0]}@*/${local.github_repo_parts[1]}@*:*",
  ]
}

data "aws_iam_policy_document" "trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      # Any branch, tag or environment of this one repo.
      values = local.github_sub_patterns
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name                 = var.role_name
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  max_session_duration = 3600

  tags = var.tags
}

# Scoped to exactly the AWS calls deploy-backend.yml and deploy-frontend.yml make --
# nothing more. This role is assumable by any workflow_dispatch run on the repo, a much
# lower bar than AWS account access, so it deliberately does NOT get the broad
# permissions a `terraform apply` of this whole stack would need (DynamoDB, SES, API
# Gateway, IAM role management, ...) -- apply always runs locally, under a human's own
# credentials, never through this role.
data "aws_iam_policy_document" "deploy_permissions" {
  statement {
    sid       = "CallerIdentity"
    effect    = "Allow"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }

  # deploy-backend.yml: UpdateFunctionCode pushes the new bundle; GetFunction is what
  # the `aws lambda wait function-updated-v2` polls to confirm the update finished.
  statement {
    sid       = "LambdaCodeDeploy"
    effect    = "Allow"
    actions   = ["lambda:UpdateFunctionCode", "lambda:GetFunction"]
    resources = [var.lambda_function_arn]
  }

  # deploy-frontend.yml: `aws s3 sync --delete` needs to list the bucket to diff
  # against, then put/delete individual objects.
  statement {
    sid       = "FrontendBucketList"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [var.frontend_bucket_arn]
  }

  statement {
    sid       = "FrontendBucketObjects"
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${var.frontend_bucket_arn}/*"]
  }

  # deploy-frontend.yml: cache invalidation after the sync.
  statement {
    sid       = "FrontendCacheInvalidate"
    effect    = "Allow"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [var.cloudfront_distribution_arn]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "${var.role_name}-permissions"
  role   = aws_iam_role.github_actions.id
  policy = data.aws_iam_policy_document.deploy_permissions.json
}
