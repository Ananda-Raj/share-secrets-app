# Changelog

## v2.0.0 (2026-11-20)

### Upgrading from v1

This release changes infrastructure, so run `terraform apply` first (new API route,
SES permission, Lambda runtime), then deploy the backend and frontend. The deploy
workflows only push code. No data migration is needed. A saved accent color is
ignored; pick a theme in **Admin → Customize**.

### Added

- Four themes: Obsidian, Midnight, Racing green and Heritage, on a new **Customize** tab.
  They replace the accent color.
- Make someone admin, or take it back, from **Admin → Users**. It needs a sign-in in the
  last 10 minutes, you can't change your own role or remove the last admin, and every
  admin is emailed about each change.
- **Admin → Activity → Reset** shows AWS CLI commands to delete history by date range or
  sender. The app itself still can't delete history.
- **Not sent** status: if an email can't be sent, the secret is deleted at once, and an
  unverified recipient in the SES sandbox gets a clear message.
- Local accounts are now added from **Admin → Users**.

### Changed

- Lambda runtime is Node.js 24 (`nodejs24.x`). Node.js 20 is deprecated on Lambda.
- Admin and History pages are wider, and the Activity tab is reorganized.
- Vite 8, TypeScript 7 and the latest AWS SDK. GitHub Actions run on Node 24.
- The Release workflow accepts an exact version and uses this file for release notes.

### Fixed

- In the SES sandbox, sending to anyone other than the sender was denied.
- Removing an admin's account left their admin role behind.
- `terraform plan` always showed a CloudFront TLS change on the default domain.
- npm audit warnings in the frontend build tools.

## v1.0.0

First public release: zero-knowledge secret sharing by email with a one-time code,
burn after read, small files, several recipients per send, OIDC/self-sign-up/local
sign-in, history and revoke, an admin page (activity, CSV, monthly summary, branding,
sharing rules) and GitHub Actions deploys with OIDC.
