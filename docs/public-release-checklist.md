# Public Release Checklist

Use this checklist before making the repository public. The goal is to avoid exposing secrets, generated artifacts, stale docs, broken CI, or misleading product claims.

## 1. Repository Hygiene

- [ ] Confirm the default branch is the intended public branch.
- [ ] Remove generated artifacts from git history where practical.
- [ ] Confirm `.gitignore` covers `node_modules/`, `dist/`, `coverage/`, `test-results/`, logs, `.env*`, and Revit build outputs.
- [ ] Remove local machine paths, private notes, temporary debug files, and abandoned experiments.
- [ ] Review binary files and large assets for licensing and necessity.

## 2. Secret And Privacy Review

- [ ] Search the full repository for API keys, tokens, passwords, private URLs, and customer data.
- [ ] Rotate any secret that may have been committed historically.
- [ ] Confirm demo data is synthetic.
- [ ] Confirm screenshots, sample graphs, and Revit examples do not expose client projects.
- [ ] Confirm browser `localStorage` keys are documented as local-only and not a recommended enterprise secret store.

Suggested searches:

```powershell
rg "sk-|gsk_|sk-or-|api[_-]?key|secret|password|token|bearer|client[_-]?secret" .
rg "C:\\\\Users|/Users/|customer|client|confidential|internal only" .
```

## 3. Documentation Readiness

- [ ] Update `README.md` so it accurately describes the current app, setup, tests, and limitations.
- [ ] Link only current docs from the README.
- [ ] Remove or rewrite stale phase plans that contradict the current repo.
- [ ] Add a clear status note if backend, Revit, or enterprise features are prototype-only.
- [ ] Confirm license, contribution expectations, and support boundaries are clear.
- [ ] Run the merge readiness checklist before merging the public-release branch.

## 4. CI And Test Gates

- [ ] `npm run lint:all`
- [ ] `npm run test -- --coverage --reporter=verbose`
- [ ] `npm run test:e2e`
- [ ] `npm run build`
- [ ] `npm audit --audit-level=moderate`

CI should run these gates on pull requests to the public default branch. Warnings are acceptable only when the command exits successfully and the warnings are known.

## 5. Build And Runtime Review

- [ ] Confirm `npm install` and `npm start` work on a clean clone.
- [ ] Confirm the app opens at the documented local URL.
- [ ] Confirm production build output is not committed.
- [ ] Confirm Vite does not watch generated `coverage/`, `test-results/`, or `dist/` artifacts during E2E runs.
- [ ] Confirm app behavior is graceful when optional integrations are unavailable.

## 6. Legal And Licensing

- [ ] Confirm the project license is intentional.
- [ ] Confirm third-party dependencies are compatible with public release.
- [ ] Confirm copied snippets, generated images, sample data, and design assets are allowed to be public.
- [ ] Add attribution where required.

## 7. GitHub Repository Settings

- [ ] Set repository description, topics, and website/demo URL if available.
- [ ] Protect the default branch.
- [ ] Require PR review before merge.
- [ ] Require CI checks before merge.
- [ ] Enable Dependabot or equivalent dependency update scanning.
- [ ] Enable secret scanning and push protection if available.
- [ ] Configure issue templates or disable issues until support policy is ready.

## 8. Public Launch Sequence

1. Merge documentation cleanup.
2. Merge backend/API hardening branches.
3. Merge CI/test fixes.
4. Run the full release gate locally.
5. Push and confirm GitHub Actions pass.
6. Review repository contents from a clean clone.
7. Update GitHub repository settings.
8. Switch repository visibility to public.
9. Create a first public release tag.
10. Announce with an explicit prototype/roadmap status.

## Not Required Before Public Source Release

- Full enterprise SaaS backend.
- Production SSO/SAML.
- Managed database deployment.
- Revit marketplace packaging.
- SOC 2 controls.

These are required for enterprise production rollout, not for making the source repository public.
