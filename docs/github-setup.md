# GitHub Setup Guide

This repository includes comprehensive GitHub configurations for a government mail management system.

## Prerequisites

- GitHub CLI (`gh`) installed and authenticated
- Repository owner or admin permissions

## Setup Steps

Run the setup script from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-github.ps1
```

This script will:

1. **Create or update the repository** with proper metadata
2. **Configure branch protection** on `main`:
   - Required status checks (CI must pass)
   - Strict status checks (required on latest commit)
   - Pull request reviews
   - Dismiss stale reviews
   - Linear history required
   - No force pushes
   - No deletions
   - Conversation resolution required
3. **Enable security features**:
   - Dependabot vulnerability alerts
   - Automated security fixes
   - Secret scanning
   - Secret scanning push protection
4. **Configure GitHub Actions**:
   - Enable all actions
   - Set default workflow token to read-only
5. **Set up GitHub Pages** for documentation
6. **Create the production environment**
7. **Apply repository labels** for issue tracking
8. **Create milestones** for version planning
9. **Create a project board** for roadmap tracking
10. **Publish the v1.0.0 release**

## Manual Branch Protection

If you prefer to configure branch protection manually via the GitHub UI:

1. Go to **Settings** → **Branches**
2. Click **Add branch protection rule**
3. Configure:
   - **Branch name pattern**: `main`
   - **Require a pull request before merging**: Enabled
   - **Require approvals**: At least 1 (recommended)
   - **Dismiss stale pull request approvals when new commits are pushed**: Enabled
   - **Require status checks to pass before merging**: Enabled
   - **Require branches to be up to date before merging**: Enabled
   - **Require branches to be up to date before merging**: Enabled (strict)
   - **Do not allow bypassing the above settings**: Enabled
   - **Require linear history**: Enabled
   - **Allow force pushes**: Disabled
   - **Allow deletions**: Disabled
   - **Require conversation resolution before merging**: Enabled

## GitHub Actions CI/CD

The repository includes:

- **CI workflow** (`.github/workflows/ci.yml`): Runs on push to main and PRs
  - Server: lint, migrations, tests, smoke tests
  - Client: lint, tests, production build
  - Docker: builds and caches images
- **CodeQL workflow**: Static analysis for security
- **Dependency review**: Checks for vulnerable dependencies
- **Release workflow**: Automated Docker image publishing
- **Pages workflow**: Deploys documentation
- **Scorecard workflow**: Security best practices scoring
- **Stale workflow**: Closes inactive issues/PRs
- **Release drafter**: Auto-generates release notes

## Issue Templates

Three issue templates are provided:

1. **Bug Report** (`.github/ISSUE_TEMPLATE/bug_report.yml`): For reporting bugs
2. **Feature Request** (`.github/ISSUE_TEMPLATE/feature_request.yml`): For proposing new features
3. **Config** (`.github/ISSUE_TEMPLATE/config.yml`): Template configuration

## CODEOWNERS

The `.github/CODEOWNERS` file defines code ownership for review requirements. Update the usernames to match your team.

## After Setup

Once the setup script completes:

1. Update `.github/CODEOWNERS` with your actual GitHub usernames
2. Review and adjust branch protection rules as needed
3. Configure repository secrets in GitHub Settings → Secrets and variables → Actions
4. Review the CI/CD workflows and adjust for your deployment pipeline
5. Update the documentation in the `docs/` directory

## Troubleshooting

If the setup script fails:

1. Ensure you have the required GitHub permissions
2. Refresh your GitHub CLI authentication:
   ```bash
   gh auth refresh -s repo,read:org,workflow,project
   ```
3. Check the error messages and manually configure any failed steps via the GitHub UI
