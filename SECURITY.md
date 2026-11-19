# Security policy

SecretShare handles other people's secrets, so a real vulnerability has real
consequences. Please report it privately, not in a public issue.

## Reporting a vulnerability

Open this repository's **Security** tab and choose **Report a vulnerability**. This
creates a private advisory that only the maintainers can see. Include:

- what the issue is and what an attacker could do with it
- steps to reproduce, or a proof of concept
- the version or commit you tested

Please don't:

- open a public issue or pull request for an unfixed vulnerability
- test against a deployment you don't own or don't have permission to test
- try to read, change or exfiltrate real secrets or user data

You'll get an acknowledgement within 5 business days. Confirmed issues get a fix or a
mitigation plan within 30 days, sooner if critical. With your permission, you'll be
credited in the advisory once a fix ships.

## Scope

In scope: the application in `App-code/` and the infrastructure defined in `Infra/`.

Out of scope: AWS itself and your identity provider (please report those to their
vendors), and a deployment whose operator has changed the code.

## Deliberate design choices

These are intentional, so please read [Doc/design.md](Doc/design.md) before reporting
them:

- **The send-time Lambda call sees the key once, in memory,** because the server builds
  the email link. It's never stored or logged.
- **The sender is shown each link once, right after sending,** so they can share it
  another way too. Their browser built it from the key it generated, and opening it
  still needs the code from the recipient's email.
- **The 6-digit code is an access gate, not key material.** Deriving the key from it
  would make offline brute force possible.
- **Burn after read allows a 5-minute grace window** after the first correct code, so a
  failed decrypt doesn't destroy the secret.
- **Admins can promote and demote other admins, with safeguards.** It needs a sign-in
  within the last 10 minutes, so an old stolen session can't do it. You can't change
  your own role or remove the last admin, and every admin is emailed about each change.
- **History can't be deleted from inside the app.** The app can add to the audit trail
  but never delete from it, so a stolen admin session can't erase what was shared. Rows
  expire after a year; deleting sooner needs AWS access (Admin → Activity → Reset shows
  the commands).
- **Only the sender can revoke a send,** never an admin on their behalf.
- **Turning off file attachments is advisory.** The server can't see inside the
  ciphertext, so a modified client could still send a file as text.
- **Removing an SSO user only clears Cognito's copy.** The identity provider still
  controls who can sign in.

If you can actually exploit one of these, rather than just disagree with it, please do
report it. The same goes for the known limitations listed in
[Doc/design.md](Doc/design.md#known-limitations).
