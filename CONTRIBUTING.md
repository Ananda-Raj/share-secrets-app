# Contributing

Thanks for considering a contribution. A few notes to make it go smoothly.

## Before you start

- For anything bigger than a small fix, open an issue first to agree on the approach.
- Security vulnerabilities go through [SECURITY.md](SECURITY.md), not a public issue or
  pull request.
- Read [Doc/design.md](Doc/design.md). Several choices that look like oversights are
  deliberate: the access code is never key material, the secrets table has no backups,
  and granting admin isn't possible in the app. If your change works against one of
  these, raise it as a question before writing code.

## Project layout

```
App-code/frontend/   Vite + TypeScript single-page app, no UI framework, no runtime deps
App-code/backend/    Node.js 20 + TypeScript Lambda, one function routed by src/index.ts
Infra/               Terraform, applied locally, never from CI
Doc/                 Design and deployment guides
```

Both apps keep runtime dependencies at or near zero, which means less to audit and a
smaller attack surface. If you add one, explain why in the pull request.

## Local development

```bash
# Backend
cd App-code/backend
npm ci
npm test
npm run typecheck
npm run build

# Frontend
cd App-code/frontend
cp .env.example .env   # point it at a real deployment to run against live APIs
npm ci
npm run dev
npm run build
```

You don't need AWS for most work. Backend logic is unit-tested without AWS (see
`App-code/backend/test/`), and the frontend typechecks and builds without real values,
which is exactly what CI does.

## Terraform

Terraform never runs in CI. A pull request that touches `Infra/` is failed by
`guard-infra.yml` on purpose. If your change needs infrastructure, describe it in the
pull request, and a maintainer will apply and verify it on their own deployment. Run
`terraform fmt` and `terraform validate` on anything you change there.

## Pull requests

- Keep each pull request to one logical change.
- Make sure **PR Checks** (typecheck, test, build for both apps) is green.
- Add tests for new backend logic where practical. Pure functions such as validation,
  parsing and aggregation are the easiest and most useful to cover.
- Explain why, not just what, especially for anything touching encryption, sign-in,
  roles or the audit data.

## Code style

Nothing beyond `tsc` and `terraform fmt` is enforced. Match the surrounding code, prefer
clear over clever, and keep comments short. Use them to explain why, not what.

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE).
