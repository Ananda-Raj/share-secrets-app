# Creating this resource makes AWS send a verification email to `sender_email` —
# someone has to click that link before SES will actually send anything from it.
# New AWS accounts also start in the SES "sandbox", which additionally restricts
# sending to other addresses that are *themselves* verified, until production access
# is requested via the AWS console/support (see Doc/deployment.md).
resource "aws_sesv2_email_identity" "sender" {
  email_identity = var.sender_email

  tags = var.tags
}
