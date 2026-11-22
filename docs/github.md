# GitHub configuration

The repository is provisioned for the full GitHub workflow. Most settings are
applied by `scripts/setup-github.ps1`; the rest are declarative files under
`.github/`.

## One-command provisioning

```bash
gh auth login
gh auth refresh -s repo,read:org,workflow,project
powershell -ExecutionPolicy Bypass -File scripts/setup-github.ps1
```

The script is idempotent and best-effort. It:

1. Creates the private repository if needed.
2. Commits and pushes `main`.
3. Sets the description, topics and feature toggles.
4. Applies every label from `.github/labels.yml`.
5. Creates the `v1.0.0`, `v1.1.0` and `v2.0.0` milestones.
6. Creates the **Mail Management Roadmap** project board.
7. Protects `main`: PR required, linear history, conversation resolution,
   no force pushes or deletions, required CI checks.
8. Enables Dependabot alerts, automated fixes, secret scanning and push
   protection where the plan allows.
9. Restricts the default Actions token to read-only.
10. Configures GitHub Pages to deploy from Actions.
11. Creates the `production` environment.
12. Publishes the `v1.0.0` release.

Steps requiring plan features or admin rights are reported as warnings rather
than failing the run.

## Workflows

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `ci.yml` | push/PR to `main` | Lint, migrate, test, smoke test, client build, Docker build |
| `codeql.yml` | push/PR + weekly | CodeQL security-and-quality analysis |
| `dependency-review.yml` | pull request | Block high-severity dependency changes |
| `scorecard.yml` | weekly + branch protection | OpenSSF Scorecard SARIF |
| `release.yml` | `v*.*.*` tag | GitHub release + GHCR images for API and web |
| `pages.yml` | `docs/**` on `main` | Publish this documentation |
| `stale.yml` | daily | Mark and close inactive issues/PRs |
| `release-drafter.yml` | push/PR to `main` | Keep a draft release updated |

## Required checks

Branch protection expects these job names:

- `Server (lint, migrate, test)`
- `Client (lint, test, build)`

Keep the job names stable or update the protection rule accordingly.

## Dependabot

`.github/dependabot.yml` opens grouped weekly updates for:

- `server` npm packages,
- `client` npm packages,
- GitHub Actions,
- Docker base images.

Minor and patch updates are grouped to reduce noise.

## Templates

- Bug report and feature request forms under `.github/ISSUE_TEMPLATE/`.
- Blank issues disabled; security reports routed to private advisories.
- Pull request checklist covering lint, tests, migrations and translations.

## Releases

1. Merge changes to `main`.
2. Release Drafter keeps a draft with categorized changes.
3. Tag `vX.Y.Z` (or publish the draft).
4. `release.yml` creates the release and pushes
   `ghcr.io/harris-graham/mail-management/api` and `.../web`.

## Container images

```bash
docker pull ghcr.io/harris-graham/mail-management/api:latest
docker pull ghcr.io/harris-graham/mail-management/web:latest
```

Images are tagged with the semantic version, major/minor and `latest`.

## Pages

Documentation is published from `docs/` with Jekyll:

<https://harris-graham.github.io/mail-management/>

## Repository settings checklist

- [ ] Private visibility confirmed.
- [ ] Discussions enabled.
- [ ] Wiki disabled (docs live in `docs/`).
- [ ] Squash merge only; branch deleted on merge.
- [ ] Auto-merge enabled.
- [ ] CODEOWNERS review requested.
- [ ] Actions token read-only by default.
- [ ] Secret scanning and push protection on.
- [ ] Pages source set to GitHub Actions.
- [ ] `production` environment created.
- [ ] First release published.

## Local git hooks (optional)

```bash
npm --prefix server run lint
npm --prefix server test
npm --prefix client run lint
```

Consider enabling the pre-commit hook with Husky in a future change.
