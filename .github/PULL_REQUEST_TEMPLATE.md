## What this changes and why

## Does this touch Infra/?

If yes: `guard-infra.yml` will fail this PR by design (Terraform is local-only, never
applied from CI — see Doc/deployment.md). Describe the infra change here so a maintainer can
apply and verify it from their own AWS account; don't try to work around the guard.

## Testing

- [ ] `pr-check.yml` is green (backend typecheck/test/build, frontend typecheck/build)
- [ ] Added/updated tests for new backend logic, where practical
- [ ] Manually tested the actual flow (describe how, if UI-facing)

## Security-relevant?

If this touches encryption, auth, roles/admin, or the audit/history data, explain how it
respects the existing model (zero-knowledge encryption, OTP as access-gate-only,
non-self-service admin-granting — see Doc/design.md and SECURITY.md).
