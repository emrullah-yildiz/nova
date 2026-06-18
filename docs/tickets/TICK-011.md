---
id: TICK-011
title: Installer — Cosign/Sigstore keyless code signature for open-source release
status: draft
priority: high
type: chore
sprint: A2
created: 2026-06-17
lanes: platform
branch: chore/tick-011-installer-codesign
---

## Summary

Nova is now open source. When users download the Nova Connect installer (`.msi`) from the GitHub Releases page, Windows SmartScreen throws an "Unknown publisher" warning because the binary has no code signature. This ticket adds a keyless code signature via **Cosign + Sigstore** to the GitHub Actions release workflow so the `.msi` is transparently signed at release time without requiring a paid EV certificate.

## Problem definition

Unsigned executables downloaded from the internet are flagged by Windows as coming from an unknown publisher. First-run users see a scary SmartScreen dialog ("Windows protected your PC") with no clear publisher name, which breaks trust and forces users to manually bypass the warning. The fix is a code signature attached to the artifact at release time, verified via the Sigstore public transparency log (Rekor), so anyone can verify authenticity without purchasing a commercial cert.

## Acceptance criteria

- [ ] AC-1  A GitHub Actions `release` workflow job runs `cosign sign-blob` (keyless, OIDC-backed) on the compiled `.msi` artifact and uploads the resulting `.sig` and `.pem` bundle files alongside the `.msi` in the GitHub Release assets.
- [ ] AC-2  The release job fails (exit non-zero) if `cosign sign-blob` returns a non-zero exit code, preventing an unsigned artifact from being published silently.
- [ ] AC-3  A `docs/architecture/codesigning.md` file explains how to verify a downloaded `.msi` using `cosign verify-blob`, including the exact command a user would run, so any contributor or end-user can confirm authenticity.
- [ ] AC-4  The existing CI jobs (`lint`, `test`, `security`, `deploy-dev`, `deploy-production`) are unchanged — no existing job step is removed, reordered, or given new required dependencies.
- [ ] AC-5  No private key material, certificate file, or secret is committed to the repository; the signing is purely OIDC-based (GitHub Actions OIDC token) with no stored credentials beyond what already exists in the repo's encrypted secrets.

## Testing gate

- E2E (Playwright): not applicable — no browser UI changed.
- Unit test: not applicable.
- Manual / CI: AC-1, AC-2 verified by triggering the release workflow on a test tag (or dry-run inspection of the workflow YAML). AC-3 verified by running the documented `cosign verify-blob` command against the uploaded artifacts.

## How to test

1. `git switch develop && git pull --ff-only && git switch chore/tick-011-installer-codesign`
2. `npm run lint:all` — must pass (YAML linting via existing pipeline).
3. Inspect `.github/workflows/release.yml` (new file): confirm `cosign sign-blob` step is present, that it uses GitHub OIDC (`id-token: write` permission), and that it uploads `.sig` + `.pem` as release assets.
4. (Optional dry run) Push a test tag `v0.0.0-codesign-test` to a fork and confirm the release job produces a `.sig` file in the release assets without errors.
5. Read `docs/architecture/codesigning.md` — confirm the `cosign verify-blob` command is present and correct for the artifact structure.

## Definition of done

- [ ] All AC above are checked `[x]`
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] E2E spec covers UI-gated ACs (not applicable here)
- [ ] Oracle has reviewed and issued APPROVE verdict
- [ ] Merged to `develop`, branch deleted, workboard row released, INDEX.md updated

## Task briefs

Links added by morpheus after PM confirms AC.

- [T11a](../task-briefs/T11a-installer-codesign.md) — platform: description (to be written post-AC confirmation)

## Run comments

<!-- Agents write here. REPLACED every run — old content deleted, not appended. -->
<!-- This section feeds directly into the Coordinator Response in docs/PM.md.   -->

**Run 2026-06-17**
- Issue: null — new ticket, no prior work.
- Changed: docs/tickets/TICK-011.md created (draft status, awaiting PM AC confirmation).
- How to test: n/a until AC confirmed and agents dispatched.
- Playwright: not applicable.
- Status: pending PM confirmation of AC.
