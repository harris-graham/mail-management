# Government Mail Management

A production-grade platform for registering, routing, vising and archiving
government correspondence, consultation requests and financial engagement
requests.

[![CI](https://github.com/harris-graham/mail-management/actions/workflows/ci.yml/badge.svg)](https://github.com/harris-graham/mail-management/actions/workflows/ci.yml)
[![CodeQL](https://github.com/harris-graham/mail-management/actions/workflows/codeql.yml/badge.svg)](https://github.com/harris-graham/mail-management/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://github.com/harris-graham/mail-management/actions/workflows/scorecard.yml/badge.svg)](https://github.com/harris-graham/mail-management/actions/workflows/scorecard.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Overview

The application replaces a legacy PHP/SQLite mail register with a modern,
auditable and role-based platform. It keeps the original French terminology
(`correspondance`, `consultation`, `DEF`, `visa`, `bordereau`) and adds an
English interface.

- **Frontend** — React 18, MUI 5, i18next (French/English), Socket.IO, installable PWA.
- **Backend** — Node.js 22+, Express 4, Zod validation, Pino logging, Socket.IO.
- **Database** — PostgreSQL 17 with forward-only SQL migrations and full-text search.
- **Security** — bcrypt passwords, short-lived JWT access tokens, rotating
  refresh tokens in `HttpOnly` cookies, CSRF double-submit tokens, TOTP MFA,
  RBAC, rate limiting, Helmet and a complete audit trail.
- **Delivery** — Docker Compose, multi-stage images, GitHub Actions, GHCR and
  GitHub Pages documentation.

## Features

### Mail lifecycle
- Registration of correspondence, consultations and DEF (engagement) requests
  with automatic reference numbering.
- Workflow state machine: `draft → registered → analyzed → pending_visa →
  visa_approved/visa_rejected → assigned → in_progress → processed → archived`.
- Visa approval/rejection with decision date, project and observation.
- Assignment to agents, watchers, comments and a complete event history.
- Bulk actions: assign, process, archive, delete.
- Archive and restore, with an immutable audit trail.
- Priority, confidentiality levels (`public`, `internal`, `confidential`,
  `secret`) and SLA due dates with overdue tracking.

### Documents and search
- Attachments stored on disk with MIME validation and size limits.
- OCR for scanned PDFs and images.
- PostgreSQL full-text search across subject, analysis, observation and
  reference.
- Saved searches per user.
- PDF receipt with QR code, XLSX/CSV exports.

### Administration
- User management with roles: `admin`, `supervisor`, `agent`, `consultation`,
  `archivist`.
- Reference data management: natures, ministries, services, departments.
- Database status, migrations, JSON backup and SQLite import from the UI.
- Runtime settings, email accounts (IMAP ingestion), webhooks and API keys.
- Maintenance cleanup job.

### Analytics and notifications
- Dashboard counters, SLA compliance, workload per agent and time series.
- Analytics by nature, ministry, service, agent, status and type.
- Real-time in-app notifications over Socket.IO and optional SMTP email.

### Interface
- French by default, English available at any time.
- Responsive MUI layout, dark-ready theme tokens, keyboard-friendly tables.
- Installable PWA with manifest and shortcuts.

## Architecture

```mermaid
flowchart LR
  Browser[React SPA] -->|REST + JWT| API[Express API]
  Browser <-->|Socket.IO| WS[Realtime gateway]
  API --> PG[(PostgreSQL 17)]
  API --> FS[(Uploads / OCR)]
  API --> SMTP[SMTP]
  IMAP[IMAP mailbox] --> API
  API --> GHCR[(GHCR images)]
```

See [docs/architecture.md](docs/architecture.md) for the detailed design.

## Quick start

### Option 1 — Docker Compose (recommended)

```bash
cp .env.example .env
# Edit .env and set strong secrets.
docker compose up -d --build
docker compose exec api node src/db/seed.js
```

- UI: <http://localhost:3000>
- API: <http://localhost:5000/api/v1>
- API docs: <http://localhost:5000/api/docs>
- PostgreSQL: `localhost:5432`

### Option 2 — Local development

Requirements: Node.js 22+, npm 10+, PostgreSQL 17 (or Docker for the database).

```bash
cp .env.example .env
docker compose up -d db

npm --prefix server install
npm --prefix client install --legacy-peer-deps

npm --prefix server run db:migrate
npm --prefix server run db:seed
npm --prefix server run db:import   # optional: import the legacy SQLite file

npm --prefix server run dev         # terminal 1
npm --prefix client start           # terminal 2
```

If Docker is not available, the server ships an embedded PostgreSQL launcher
for development:

```bash
npm --prefix server run db:dev      # starts PostgreSQL on port 5433
```

Then set `DATABASE_URL=postgres://mail:mail@localhost:5433/mail_management`.

The default administrator is created by `db:seed` from `ADMIN_MATRICULE` and
`ADMIN_PASSWORD` in `.env` (default `admin` / `Admin@12345`). **Change it on
first login.**

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `NODE_ENV` | Runtime mode | `development` |
| `PORT` | API port | `5000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://mail:mail@localhost:5432/mail_management` |
| `DB_SSL` | Require TLS to PostgreSQL | `false` |
| `JWT_SECRET` | Access-token signing secret (32+ chars) | dev-only value |
| `ACCESS_TOKEN_TTL` | Access-token lifetime | `15m` |
| `REFRESH_TOKEN_DAYS` | Refresh-token lifetime | `7` |
| `CORS_ORIGINS` | Allowed browser origins, comma separated | `http://localhost:3000` |
| `UPLOAD_DIR` | Attachment storage directory | `server/uploads` |
| `MAX_UPLOAD_MB` | Maximum attachment size | `25` |
| `ADMIN_*` | Bootstrap administrator | `admin` / `Admin@12345` |
| `SMTP_*` | Outgoing email | disabled |
| `IMAP_*` | Mailbox ingestion | disabled |
| `ENABLE_SCHEDULER` | SLA and ingestion scheduler | `true` |
| `LOG_LEVEL` | Pino level | `info` |

See [.env.example](.env.example) for the complete list.

## Database

Migrations live in `server/src/db/migrations` and are applied in order:

```bash
npm --prefix server run db:migrate
npm --prefix server run db:seed
npm --prefix server run db:backup
npm --prefix server run db:reset      # destructive
```

Import the legacy SQLite database (idempotent, keyed by `legacy_key`):

```bash
npm --prefix server run db:import -- path/to/mail_management.db
```

See [docs/database.md](docs/database.md) for the schema and migration rules.

## Testing

```bash
npm --prefix server run lint
npm --prefix server test
npm --prefix server run smoke          # requires a migrated and seeded database

npm --prefix client run lint
npm --prefix client test -- --watchAll=false
npm --prefix client run build
```

## API

- Base URL: `/api/v1`
- OpenAPI/Swagger UI: `/api/docs`
- Health: `/api/v1/health`, `/api/v1/health/ready`, `/api/v1/health/live`

See [docs/api.md](docs/api.md) for the endpoint reference.

## Security

Please read [SECURITY.md](SECURITY.md) before deploying. Highlights:

- Never commit `.env`, `*.db` or `server/uploads`.
- Set a strong `JWT_SECRET` and change the bootstrap password.
- Run behind HTTPS; cookies are `Secure` in production.
- Restrict database and SMTP/IMAP credentials to least privilege.
- Review audit logs regularly.

## GitHub features

The repository is provisioned for the full GitHub workflow: Actions (CI,
CodeQL, Scorecard, dependency review, release, Pages), Dependabot, issue and PR
templates, labels, milestones, projects, CODEOWNERS, branch protection,
environments, releases and GHCR packages.

Run the provisioning script (requires the GitHub CLI):

```bash
powershell -ExecutionPolicy Bypass -File scripts/setup-github.ps1
```

See [docs/github-setup.md](docs/github-setup.md) for detailed setup instructions.

## Project structure

```
.
├── client/                 React SPA
│   ├── public/             PWA manifest and icons
│   └── src/
│       ├── api/            Axios client with refresh and CSRF
│       ├── auth/           Session, permissions and notifications
│       ├── components/     Shared layout and UI primitives
│       ├── i18n/           French and English translations
│       └── pages/          Application screens
├── server/                 Express API
│   ├── scripts/            Migration, backup, smoke and dev-database tools
│   └── src/
│       ├── config/         Validated environment
│       ├── db/             Pool, migrations and seed
│       ├── jobs/           Scheduler
│       ├── lib/            Auth, audit, errors, storage, validation
│       ├── middleware/     Auth, CSRF, rate limits, uploads
│       ├── routes/         REST endpoints
│       └── services/       Mail, workflow, analytics, email, OCR
├── docs/                   GitHub Pages documentation
├── scripts/                Repository provisioning
└── docker-compose.yml      PostgreSQL + API + web
```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
Use conventional commits and open a pull request against `main`.

## License

[MIT](LICENSE)
