<#
.SYNOPSIS
    Provision the mail-management repository on GitHub with the full feature set.

.DESCRIPTION
    Creates (or updates) the private repository, pushes the current branch,
    configures metadata, features, labels, milestones, a project board,
    branch protection, security settings, Actions permissions, Pages and the
    first release.

    Requires the GitHub CLI (https://cli.github.com) authenticated with an
    account that can administer the target repository. Run from the repository
    root:

        powershell -ExecutionPolicy Bypass -File scripts/setup-github.ps1

    Every step is best-effort: a step that the token or plan cannot perform is
    reported as a warning instead of aborting the whole run.

.PARAMETER Owner
    GitHub account or organization. Defaults to harris-graham.

.PARAMETER Repo
    Repository name. Defaults to mail-management.

.PARAMETER Visibility
    private (default), public or internal.

.PARAMETER SkipPush
    Do not create the initial commit or push the branch.

.PARAMETER SkipRelease
    Do not create the v1.0.0 tag and release.
#>
[CmdletBinding()]
param(
    [string]$Owner = 'harris-graham',
    [string]$Repo = 'mail-management',
    [ValidateSet('private', 'public', 'internal')]
    [string]$Visibility = 'private',
    [switch]$SkipPush,
    [switch]$SkipRelease
)

$ErrorActionPreference = 'Stop'
$repoSlug = "$Owner/$Repo"
$script:failures = @()

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "  [ok]   $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "  [warn] $Message" -ForegroundColor Yellow
}

function Write-Fail([string]$Message) {
    Write-Host "  [fail] $Message" -ForegroundColor Red
    $script:failures += $Message
}

function Test-Executable([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Gh {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [switch]$AllowFailure
    )
    $output = & gh @Arguments 2>&1
    $code = $LASTEXITCODE
    if ($code -ne 0 -and -not $AllowFailure) {
        throw ($output | Out-String).Trim()
    }
    return [pscustomobject]@{ Code = $code; Output = ($output | Out-String).Trim() }
}

function Get-JsonInputFile([hashtable]$Body) {
    $path = Join-Path ([System.IO.Path]::GetTempPath()) ("gh-body-" + [guid]::NewGuid() + ".json")
    ($Body | ConvertTo-Json -Depth 10) | Set-Content -Path $path -Encoding UTF8
    return $path
}

# ---------------------------------------------------------------------------
# Preconditions
# ---------------------------------------------------------------------------
Write-Step 'Checking prerequisites'

if (-not (Test-Executable 'gh')) {
    throw 'GitHub CLI (gh) is required. Install it from https://cli.github.com.'
}
if (-not (Test-Executable 'git')) {
    throw 'git is required.'
}

$auth = & gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI is not authenticated. Run 'gh auth login' first.`n$($auth | Out-String)"
}
Write-Ok 'gh and git are available and authenticated'

# Make sure the git credential helper knows about gh.
Invoke-Gh -Arguments @('auth', 'setup-git') -AllowFailure | Out-Null

# ---------------------------------------------------------------------------
# Repository
# ---------------------------------------------------------------------------
Write-Step "Ensuring repository $repoSlug exists"

$view = Invoke-Gh -Arguments @('repo', 'view', $repoSlug, '--json', 'name') -AllowFailure
if ($view.Code -ne 0) {
    $createArgs = @(
        'repo', 'create', $repoSlug,
        '--description', 'Government mail management platform: registration, visa, assignment, archive, analytics. React + Express + PostgreSQL.',
        "--$Visibility"
    )
    $created = Invoke-Gh -Arguments $createArgs -AllowFailure
    if ($created.Code -ne 0) {
        throw "Could not create $repoSlug.`n$($created.Output)"
    }
    Write-Ok "Created $repoSlug ($Visibility)"
} else {
    Write-Ok "$repoSlug already exists"
}

# ---------------------------------------------------------------------------
# Initial commit and push
# ---------------------------------------------------------------------------
if (-not $SkipPush) {
    Write-Step 'Committing and pushing the current branch'

    if (-not (Test-Path '.git')) {
        & git init -b main | Out-Null
        Write-Ok 'Initialized git repository'
    }

    if (-not (& git config user.name)) {
        & git config user.name $Owner
    }
    if (-not (& git config user.email)) {
        & git config user.email "$Owner@users.noreply.github.com"
    }

    & git add -A
    & git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
        & git commit -m 'feat: production-grade mail management platform' | Out-Null
        Write-Ok 'Created initial commit'
    } else {
        Write-Ok 'No changes to commit'
    }

    $currentBranch = (& git rev-parse --abbrev-ref HEAD).Trim()
    if ($currentBranch -ne 'main') {
        & git branch -M main
        $currentBranch = 'main'
    }

    $remote = & git remote get-url origin 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $remote) {
        & git remote add origin "https://github.com/$repoSlug.git"
    } else {
        & git remote set-url origin "https://github.com/$repoSlug.git"
    }

    $push = & git push -u origin $currentBranch 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Push failed. If the message mentions the 'workflow' scope, run: gh auth refresh -s workflow,repo,read:org,project"
        Write-Host ($push | Out-String) -ForegroundColor DarkGray
    } else {
        Write-Ok "Pushed $currentBranch to origin"
    }
}

# ---------------------------------------------------------------------------
# Repository metadata and features
# ---------------------------------------------------------------------------
Write-Step 'Configuring repository metadata and features'

$editArgs = @(
    'repo', 'edit', $repoSlug,
    '--description', 'Government mail management platform: registration, visa, assignment, archive, analytics. React + Express + PostgreSQL.',
    '--enable-issues',
    '--enable-projects',
    '--enable-discussions',
    '--enable-wiki=false',
    '--enable-squash-merge',
    '--enable-merge-commit=false',
    '--enable-rebase-merge=false',
    '--enable-auto-merge',
    '--delete-branch-on-merge',
    '--allow-update-branch',
    '--add-topic', 'government',
    '--add-topic', 'mail-management',
    '--add-topic', 'correspondence',
    '--add-topic', 'postgresql',
    '--add-topic', 'express',
    '--add-topic', 'react',
    '--add-topic', 'typescript',
    '--add-topic', 'docker',
    '--add-topic', 'i18n',
    '--add-topic', 'pwa'
)
$edit = Invoke-Gh -Arguments $editArgs -AllowFailure
if ($edit.Code -eq 0) { Write-Ok 'Description, features and topics configured' }
else { Write-Warn "Repository metadata partially applied: $($edit.Output)" }

# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------
Write-Step 'Applying labels'

$labels = @(
    @{ Name = 'type:bug'; Color = 'd73a4a'; Description = 'Something is not working' },
    @{ Name = 'type:feature'; Color = '0e8a16'; Description = 'New capability' },
    @{ Name = 'type:enhancement'; Color = 'a2eeef'; Description = 'Improvement to an existing capability' },
    @{ Name = 'type:breaking'; Color = 'b60205'; Description = 'Breaking change' },
    @{ Name = 'type:security'; Color = 'ee0701'; Description = 'Security related' },
    @{ Name = 'type:performance'; Color = 'fbca04'; Description = 'Performance related' },
    @{ Name = 'type:docs'; Color = '0075ca'; Description = 'Documentation' },
    @{ Name = 'type:chore'; Color = 'cfd3d7'; Description = 'Maintenance and tooling' },
    @{ Name = 'dependencies'; Color = '0366d6'; Description = 'Dependency updates' },
    @{ Name = 'status:needs-triage'; Color = 'ededed'; Description = 'Awaiting triage' },
    @{ Name = 'status:in-progress'; Color = '1d76db'; Description = 'Work in progress' },
    @{ Name = 'status:blocked'; Color = 'b60205'; Description = 'Blocked by another task' },
    @{ Name = 'status:stale'; Color = '808080'; Description = 'No recent activity' },
    @{ Name = 'priority:critical'; Color = 'b60205'; Description = 'Must be fixed immediately' },
    @{ Name = 'priority:high'; Color = 'd93f0b'; Description = 'High priority' },
    @{ Name = 'priority:medium'; Color = 'fbca04'; Description = 'Medium priority' },
    @{ Name = 'priority:low'; Color = '0e8a16'; Description = 'Low priority' },
    @{ Name = 'area:backend'; Color = '5319e7'; Description = 'Express API' },
    @{ Name = 'area:frontend'; Color = '1d76db'; Description = 'React interface' },
    @{ Name = 'area:database'; Color = '006b75'; Description = 'PostgreSQL schema and migrations' },
    @{ Name = 'area:security'; Color = 'ee0701'; Description = 'Authentication, authorization, hardening' },
    @{ Name = 'area:devops'; Color = 'c5def5'; Description = 'CI/CD, Docker, deployment' },
    @{ Name = 'area:docs'; Color = '0075ca'; Description = 'Documentation and guides' },
    @{ Name = 'area:i18n'; Color = 'd4c5f9'; Description = 'French and English translations' },
    @{ Name = 'good first issue'; Color = '7057ff'; Description = 'Good for newcomers' },
    @{ Name = 'help wanted'; Color = '008672'; Description = 'Extra attention is needed' },
    @{ Name = 'question'; Color = 'd876e3'; Description = 'Further information is requested' },
    @{ Name = 'duplicate'; Color = 'cfd3d7'; Description = 'This issue or pull request already exists' },
    @{ Name = 'wontfix'; Color = 'ffffff'; Description = 'This will not be worked on' }
)

$labelFailures = 0
foreach ($label in $labels) {
    $result = Invoke-Gh -Arguments @(
        'label', 'create', $label.Name,
        '--color', $label.Color,
        '--description', $label.Description,
        '--force'
    ) -AllowFailure
    if ($result.Code -ne 0) { $labelFailures++ }
}
if ($labelFailures -eq 0) { Write-Ok "$($labels.Count) labels applied" }
else { Write-Warn "$labelFailures label(s) could not be applied" }

# ---------------------------------------------------------------------------
# Milestones
# ---------------------------------------------------------------------------
Write-Step 'Creating milestones'

$milestones = @(
    @{ Title = 'v1.0.0'; Description = 'PostgreSQL migration, secure authentication, workflow and production hardening.'; Due = (Get-Date).AddDays(14).ToString('yyyy-MM-ddTHH:mm:ssZ') },
    @{ Title = 'v1.1.0'; Description = 'Email ingestion, OCR, advanced analytics and saved searches.'; Due = (Get-Date).AddDays(45).ToString('yyyy-MM-ddTHH:mm:ssZ') },
    @{ Title = 'v2.0.0'; Description = 'Multi-tenant organizations, records retention policies and external portal.'; Due = (Get-Date).AddDays(120).ToString('yyyy-MM-ddTHH:mm:ssZ') }
)

$existingMilestones = Invoke-Gh -Arguments @('api', "repos/$repoSlug/milestones?state=all&per_page=100") -AllowFailure
$existingTitles = @()
if ($existingMilestones.Code -eq 0) {
    try {
        $existingTitles = ($existingMilestones.Output | ConvertFrom-Json) | ForEach-Object { $_.title }
    } catch { $existingTitles = @() }
}

foreach ($milestone in $milestones) {
    if ($existingTitles -contains $milestone.Title) { continue }
    $result = Invoke-Gh -Arguments @(
        'api', '-X', 'POST', "repos/$repoSlug/milestones",
        '-f', "title=$($milestone.Title)",
        '-f', "description=$($milestone.Description)",
        '-f', "due_on=$($milestone.Due)"
    ) -AllowFailure
    if ($result.Code -eq 0) { Write-Ok "Milestone $($milestone.Title)" }
    else { Write-Warn "Milestone $($milestone.Title) not created: $($result.Output)" }
}

# ---------------------------------------------------------------------------
# Project board
# ---------------------------------------------------------------------------
Write-Step 'Creating project board'

$project = Invoke-Gh -Arguments @(
    'project', 'create', '--owner', $Owner,
    '--title', 'Mail Management Roadmap',
    '--format', 'json'
) -AllowFailure
if ($project.Code -eq 0) { Write-Ok 'Project "Mail Management Roadmap" ready' }
else { Write-Warn "Project board skipped (token may lack the project scope): $($project.Output)" }

# ---------------------------------------------------------------------------
# Branch protection
# ---------------------------------------------------------------------------
Write-Step 'Protecting the main branch'

$protection = @{
    required_status_checks = @{
        strict = $true
        contexts = @(
            'Server (lint, migrate, test)',
            'Client (lint, test, build)'
        )
    }
    enforce_admins = $false
    required_pull_request_reviews = @{
        dismiss_stale_reviews = $true
        require_code_owner_reviews = $false
        required_approving_review_count = 0
    }
    restrictions = $null
    required_linear_history = $true
    allow_force_pushes = $false
    allow_deletions = $false
    required_conversation_resolution = $true
    lock_branch = $false
    allow_fork_syncing = $true
}

$bodyFile = Get-JsonInputFile $protection
$branch = Invoke-Gh -Arguments @(
    'api', '-X', 'PUT', "repos/$repoSlug/branches/main/protection",
    '--input', $bodyFile
) -AllowFailure
Remove-Item $bodyFile -Force -ErrorAction SilentlyContinue
if ($branch.Code -eq 0) { Write-Ok 'Branch protection enabled on main' }
else { Write-Warn "Branch protection not applied (admin rights required): $($branch.Output)" }

# ---------------------------------------------------------------------------
# Security features
# ---------------------------------------------------------------------------
Write-Step 'Enabling security features'

$vuln = Invoke-Gh -Arguments @('api', '-X', 'PUT', "repos/$repoSlug/vulnerability-alerts") -AllowFailure
if ($vuln.Code -eq 0) { Write-Ok 'Dependabot vulnerability alerts enabled' } else { Write-Warn 'Vulnerability alerts not enabled' }

$fixes = Invoke-Gh -Arguments @('api', '-X', 'PUT', "repos/$repoSlug/automated-security-fixes") -AllowFailure
if ($fixes.Code -eq 0) { Write-Ok 'Automated security fixes enabled' } else { Write-Warn 'Automated security fixes not enabled' }

$secret = Invoke-Gh -Arguments @('repo', 'edit', $repoSlug, '--enable-secret-scanning', '--enable-secret-scanning-push-protection') -AllowFailure
if ($secret.Code -eq 0) { Write-Ok 'Secret scanning and push protection enabled' }
else { Write-Warn "Secret scanning not enabled (plan or permissions): $($secret.Output)" }

# ---------------------------------------------------------------------------
# Actions permissions
# ---------------------------------------------------------------------------
Write-Step 'Configuring GitHub Actions'

$actions = Invoke-Gh -Arguments @(
    'api', '-X', 'PUT', "repos/$repoSlug/actions/permissions",
    '-F', 'enabled=true',
    '-f', 'allowed_actions=all',
    '-f', 'sha_pinning_required=false'
) -AllowFailure
if ($actions.Code -eq 0) { Write-Ok 'Actions enabled for all actions' } else { Write-Warn 'Actions permissions not updated' }

$workflowPerms = Invoke-Gh -Arguments @(
    'api', '-X', 'PUT', "repos/$repoSlug/actions/permissions/workflow",
    '-f', 'default_workflow_permissions=read',
    '-F', 'can_approve_pull_request_reviews=true'
) -AllowFailure
if ($workflowPerms.Code -eq 0) { Write-Ok 'Default workflow token is read-only' } else { Write-Warn 'Workflow permissions not updated' }

# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------
Write-Step 'Configuring GitHub Pages'

$pages = Invoke-Gh -Arguments @(
    'api', '-X', 'POST', "repos/$repoSlug/pages",
    '-f', 'build_type=workflow'
) -AllowFailure
if ($pages.Code -ne 0) {
    $pages = Invoke-Gh -Arguments @(
        'api', '-X', 'PUT', "repos/$repoSlug/pages",
        '-f', 'build_type=workflow'
    ) -AllowFailure
}
if ($pages.Code -eq 0) { Write-Ok 'Pages configured to deploy from Actions' }
else { Write-Warn "Pages not configured (admin rights required): $($pages.Output)" }

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
Write-Step 'Creating production environment'

$envFile = Get-JsonInputFile @{ wait_timer = 0 }
$environment = Invoke-Gh -Arguments @(
    'api', '-X', 'PUT', "repos/$repoSlug/environments/production",
    '--input', $envFile
) -AllowFailure
Remove-Item $envFile -Force -ErrorAction SilentlyContinue
if ($environment.Code -eq 0) { Write-Ok 'Environment "production" created' } else { Write-Warn 'Environment not created' }

# ---------------------------------------------------------------------------
# First release
# ---------------------------------------------------------------------------
if (-not $SkipRelease) {
    Write-Step 'Creating the v1.0.0 release'

    $existing = Invoke-Gh -Arguments @('release', 'view', 'v1.0.0', '--repo', $repoSlug) -AllowFailure
    if ($existing.Code -eq 0) {
        Write-Ok 'Release v1.0.0 already exists'
    } else {
        if (Test-Path '.git') {
            & git tag -a v1.0.0 -m 'Mail Management v1.0.0' 2>$null
            & git push origin v1.0.0 2>&1 | Out-Null
        }
        $releaseNotes = @"
## Mail Management v1.0.0

First production-grade release.

### Highlights
- PostgreSQL 17 schema with forward-only SQL migrations and a one-time SQLite importer.
- Secure authentication: bcrypt, short-lived JWT access tokens, rotating refresh tokens, TOTP MFA.
- Role-based access control, audit trail and immutable mail history.
- Full mail workflow: registration, analysis, visa, assignment, processing, archive and restore.
- Attachments with OCR, full-text search, saved searches and QR-coded receipts.
- Analytics, SLA tracking and PDF/XLSX/CSV exports.
- Real-time notifications, SMTP delivery and IMAP ingestion.
- French and English interface, installable PWA, Docker images and CI/CD.
"@
        $release = Invoke-Gh -Arguments @(
            'release', 'create', 'v1.0.0',
            '--repo', $repoSlug,
            '--title', 'Mail Management v1.0.0',
            '--notes', $releaseNotes
        ) -AllowFailure
        if ($release.Code -eq 0) { Write-Ok 'Release v1.0.0 published' }
        else { Write-Warn "Release not created: $($release.Output)" }
    }
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host ''
if ($script:failures.Count -eq 0) {
    Write-Host "GitHub setup complete: https://github.com/$repoSlug" -ForegroundColor Green
} else {
    Write-Host "GitHub setup finished with $($script:failures.Count) issue(s):" -ForegroundColor Yellow
    $script:failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    Write-Host "Re-run after fixing permissions: gh auth refresh -s repo,read:org,workflow,project" -ForegroundColor Yellow
}
