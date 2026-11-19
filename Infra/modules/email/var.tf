variable "sender_email" {
  description = "Email address OTP/link emails are sent from."
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
