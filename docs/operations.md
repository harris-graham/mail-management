# Operations

## Deployment options

### Docker Compose

`docker-compose.yml` defines three services:

| Service | Image | Port | Notes |
| --- | --- | --- | --- |
| `db` | `postgres:17-alpine` | 5432 | Named volume, health check |
| `api` | local `Dockerfile` | 5000 | Runs migrations then the API |
| `web` | `client/Dockerfile` (Nginx) | 3000 | Serves the SPA and proxies `/api` |

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec api node src/db/seed.js
docker compose logs -f api
```

### Single container

The API serves `client/build` when it exists. Build the client and start the
server:

```bash
npm --prefix client ci --legacy-peer-deps
npm --prefix client run build
NODE_ENV=production node server/src/index.js
```

## Health checks

| Endpoint | Use |
| --- | --- |
| `/api/v1/health/live` | Container liveness probe |
| `/api/v1/health/ready` | Readiness probe (checks PostgreSQL) |
| `/api/v1/health` | Human and dashboard check |

## Background jobs

`ENABLE_SCHEDULER=true` starts three cron jobs:

| Schedule | Job |
| --- | --- |
| Every 15 minutes | Create deadline notifications for records due within 24h |
| Every 5 minutes | Poll active IMAP accounts when `IMAP_HOST` is configured |
| Daily at 03:00 | Delete expired tokens and notifications older than 90 days |

Set `ENABLE_SCHEDULER=false` on API replicas that should not run jobs.

## Logs

Pino writes structured JSON to stdout. Each request carries a request ID that
is also returned in the `x-request-id` header.

```bash
docker compose logs -f api | jq 'select(.level >= 40)'
```

## Backups

1. **Logical** — `npm --prefix server run db:backup` writes a JSON snapshot.
2. **Physical** — schedule `pg_dump -Fc` and copy the dump off-host:

```bash
docker compose exec -T db pg_dump -U mail -Fc mail_management > backup.dump
docker compose exec -T db pg_restore -U mail -d mail_management --clean < backup.dump
```

3. **Uploads** — back up `server/uploads` or the mounted volume separately.
4. Test restores quarterly in a non-production environment.

## Upgrades

```bash
git pull
docker compose build
docker compose up -d
docker compose exec api node src/db/migrate.js
```

Migrations run automatically in the API entrypoint; running them explicitly
makes failures easier to observe. Migrations are forward-only — take a backup
before upgrading across major versions.

## Monitoring

- API health endpoints for uptime checks.
- PostgreSQL `pg_stat_activity` for connection pressure.
- `audit_log` growth and `refresh_tokens` cleanup.
- Disk usage for `uploads` and the PostgreSQL volume.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `ECONNREFUSED` on startup | `DATABASE_URL`, database health, firewall |
| `relation does not exist` | Run `db:migrate` |
| Login loops | Cookie `Secure` flag requires HTTPS in production |
| 403 on POST | Missing `X-Requested-With` or CSRF token |
| Upload rejected | `MAX_UPLOAD_MB`, MIME allow-list |
| IMAP sync silent | `IMAP_HOST` unset, account inactive, credentials |
| Slow search | Check `mail_search_idx` and `pg_trgm` indexes |
