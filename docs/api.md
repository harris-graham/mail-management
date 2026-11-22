# API reference

Base URL: `/api/v1`. All endpoints except health, login, refresh, forgot and
reset password require `Authorization: Bearer <accessToken>`.

Interactive documentation: `GET /api/docs` (Swagger UI generated from
`server/src/openapi.json`).

## Conventions

- JSON bodies, `application/json`.
- Validation errors return `400` with `error.details[]`.
- Authentication failures return `401`; permission failures return `403`.
- Missing resources return `404`; state conflicts return `409`.
- Lists return `{ data, pagination: { page, pageSize, total, totalPages } }`.
- Downloads set `Content-Disposition`.
- Mutating cookie endpoints require `X-Requested-With: XMLHttpRequest` and
  `X-CSRF-Token` matching the `csrf_token` cookie.

## Health

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness plus database check |
| GET | `/health/live` | Process is alive |
| GET | `/health/ready` | Database is reachable |

## Authentication

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/login` | `{ matricule, password, totp? }` → access token, user, CSRF |
| POST | `/auth/refresh` | Rotate refresh cookie, return a new access token |
| POST | `/auth/logout` | Revoke refresh token and clear cookies |
| GET | `/auth/me` | Current user and permissions |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` |
| POST | `/auth/mfa/setup` | Generate TOTP secret and QR data URL |
| POST | `/auth/mfa/enable` | `{ token }` → recovery codes |
| POST | `/auth/mfa/disable` | `{ password }` |
| GET | `/auth/sessions` | Active refresh tokens for the current user |
| DELETE | `/auth/sessions/:id` | Revoke one session |
| POST | `/auth/forgot-password` | `{ email }` |
| POST | `/auth/reset-password` | `{ token, newPassword }` |

### Login example

```bash
curl -c cookies.txt -X POST http://localhost:5000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"matricule":"admin","password":"Admin@12345"}'
```

```json
{
  "accessToken": "eyJ...",
  "expiresIn": "15m",
  "csrfToken": "…",
  "user": { "id": "…", "role": "admin", "permissions": ["…"] }
}
```

## Mail records

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/mail` | `mail.read` | Paginated, filtered list |
| GET | `/mail/export` | `mail.export` | CSV or XLSX export |
| POST | `/mail` | `mail.create` | Register a record |
| GET | `/mail/:id` | `mail.read` | Full record with events, comments, attachments |
| PATCH | `/mail/:id` | `mail.update` | Update editable fields |
| DELETE | `/mail/:id` | `mail.delete` | Soft delete |
| POST | `/mail/:id/transition` | varies by action | Workflow transition |
| POST | `/mail/bulk` | `mail.update` | Bulk assign/archive/process/delete |
| GET | `/mail/:id/comments` | `mail.read` | List comments |
| POST | `/mail/:id/comments` | `comment.create` | Add a comment |
| GET | `/mail/:id/attachments` | `mail.read` | List attachments |
| POST | `/mail/:id/attachments` | `attachment.create` | Multipart upload (`files`) |
| DELETE | `/attachments/:id` | `attachment.delete` | Delete attachment |
| GET | `/attachments/:id/download` | `mail.read` | Download file |
| GET | `/mail/:id/pdf` | `mail.read` | PDF receipt |
| GET | `/mail/:id/qr` | `mail.read` | QR code data URL |
| POST | `/mail/:id/send-email` | `mail.update` | Email the receipt |
| POST | `/mail/:id/watch` | `mail.read` | Watch a record |
| DELETE | `/mail/:id/watch` | `mail.read` | Unwatch |
| GET | `/saved-searches` | `mail.read` | List saved searches |
| POST | `/saved-searches` | `mail.read` | Create a saved search |
| DELETE | `/saved-searches/:id` | `mail.read` | Delete a saved search |

### List query parameters

`page`, `pageSize` (max 200), `type`, `status`, `priority`, `confidentiality`,
`year`, `from`, `to`, `q`, `ministryId`, `serviceId`, `natureId`, `assignedTo`,
`unassigned`, `overdue`, `archived`, `sort`, `direction`.

### Transition actions

`analyze`, `submit_visa`, `approve_visa`, `reject_visa`, `assign`, `start`,
`process`, `archive`, `restore`, `cancel`, `reopen`.

```bash
curl -X POST http://localhost:5000/api/v1/mail/<id>/transition \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"approve_visa","decidedAt":"2026-11-21","projetVise":"Projet de décret"}'
```

## Reference data

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/reference-data` | authenticated |
| GET/POST | `/natures` | `reference.manage` for writes |
| PATCH/DELETE | `/natures/:id` | `reference.manage` |
| GET/POST | `/ministries` | `reference.manage` for writes |
| PATCH/DELETE | `/ministries/:id` | `reference.manage` |
| GET/POST | `/services` | `reference.manage` for writes |
| PATCH/DELETE | `/services/:id` | `reference.manage` |
| GET/POST | `/departments` | `reference.manage` for writes |
| PATCH/DELETE | `/departments/:id` | `reference.manage` |

## Users

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/users/assignable` | `mail.read` |
| GET | `/users` | `user.read` |
| POST | `/users` | `user.manage` |
| PATCH | `/users/:id` | `user.manage` |
| DELETE | `/users/:id` | `user.manage` |
| POST | `/users/:id/reset-password` | `user.manage` |

## Analytics

All require `analytics.read`. Shared filters: `from`, `to`, `type`,
`interval` (`day|week|month|quarter|year`), `dimension`
(`nature|ministry|service|agent|status|type`).

| Method | Path | Description |
| --- | --- | --- |
| GET | `/analytics/summary` | Totals, processed, pending visa, overdue, average time |
| GET | `/analytics/timeseries` | Volume over time |
| GET | `/analytics/by-dimension` | Breakdown by dimension |
| GET | `/analytics/sla` | SLA compliance by priority |
| GET | `/analytics/workload` | Workload per agent |
| GET | `/analytics/export` | CSV/XLSX of the chosen dimension |

## Notifications

| Method | Path | Description |
| --- | --- | --- |
| GET | `/notifications` | Recent notifications |
| GET | `/notifications/unread-count` | Unread counter |
| POST | `/notifications/:id/read` | Mark one as read |
| POST | `/notifications/read-all` | Mark all as read |

## Administration

Admin endpoints require the matching permission (`db.manage`,
`settings.manage`, `email.manage`, `audit.read`).

| Method | Path | Description |
| --- | --- | --- |
| GET | `/admin/db/status` | Version, size, migrations, table counts |
| POST | `/admin/db/migrate` | Apply pending migrations |
| GET | `/admin/db/backup` | Download a JSON snapshot |
| POST | `/admin/db/import-sqlite` | Upload and import a legacy `.db` |
| GET | `/admin/audit` | Filterable audit log |
| GET/PUT | `/admin/settings` | Read or update runtime settings |
| GET/POST | `/admin/email-accounts` | List or create IMAP accounts |
| DELETE | `/admin/email-accounts/:id` | Delete an account |
| POST | `/admin/email-accounts/:id/sync` | Trigger an IMAP sync |
| GET | `/admin/system` | Node version, uptime, platform |
| POST | `/admin/maintenance/cleanup` | Purge expired tokens and old notifications |
| GET/POST | `/admin/webhooks` | Webhook subscriptions |
| DELETE | `/admin/webhooks/:id` | Delete a webhook |
| GET/POST | `/admin/api-keys` | API keys |
| DELETE | `/admin/api-keys/:id` | Revoke an API key |

## Realtime

Socket.IO is mounted on the same origin as the API. Connect with
`auth: { token: accessToken }`. Events:

| Event | Payload |
| --- | --- |
| `notification:new` | Notification row (`id`, `title`, `body`, `record_id`, `type`) |
