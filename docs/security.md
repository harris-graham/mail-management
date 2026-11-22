# Security

## Reporting

Do not open a public issue for a vulnerability. Use the private advisory form:
<https://github.com/harris-graham/mail-management/security/advisories/new>.
See [SECURITY.md](../SECURITY.md).

## Authentication

| Control | Implementation |
| --- | --- |
| Password storage | bcrypt, cost 12 in production |
| Password policy | Minimum 10 characters, mixed classes |
| Access token | JWT, 15 minutes, memory-only in the SPA |
| Refresh token | 32 random bytes, SHA-256 hashed at rest, rotated on use |
| Cookies | `HttpOnly`, `SameSite=Strict`, `Secure` in production |
| CSRF | Double-submit cookie plus `X-Requested-With` header |
| MFA | TOTP with 10 single-use recovery codes |
| Lockout | 5 failed attempts → 15-minute lock |
| Session revocation | Per-device revoke and revoke-all on password change |

## Authorization

Roles map to explicit permission sets in
`server/src/lib/permissions.js`. Route handlers call `requirePermission(...)`;
the frontend hides actions the user cannot perform, but the API is the source
of truth.

| Role | Scope |
| --- | --- |
| `admin` | All permissions |
| `supervisor` | Mail lifecycle, visa, assignment, analytics, users (read), audit |
| `agent` | Mail lifecycle, visa, assignment, analytics |
| `consultation` | Read mail and analytics |
| `archivist` | Read, archive, restore, export |

Record-level access additionally limits `secret` and `confidential` mail to
the creator, assignee, watchers and users with `audit.read`.

## Data protection

- `.env`, `*.db`, `server/uploads` and `.pgdata` are git-ignored.
- Attachments are stored outside the web root with random storage keys.
- SHA-256 checksums are recorded for every attachment.
- The audit log captures actor, action, entity, before/after values, IP and
  request ID for sensitive operations.
- The legacy SQLite importer keeps original rows in `metadata` and
  `legacy_rows` for traceability.

## Transport and headers

- Helmet sets secure headers; CSP is disabled only because Swagger UI and the
  SPA manage their own assets. Add a CSP at the reverse proxy if needed.
- CORS is restricted to `CORS_ORIGINS`.
- Rate limits: global API, login, uploads and exports.
- `trust proxy` is configurable for reverse proxies.

## Secrets

| Secret | Where |
| --- | --- |
| `JWT_SECRET` | Environment / GitHub secret |
| Database password | Environment / Docker secret |
| SMTP and IMAP credentials | Environment or admin UI (encrypted) |
| GitHub token | Local `gh` keyring, never committed |

Rotate `JWT_SECRET` by deploying a new value; existing access tokens expire
within 15 minutes and refresh tokens remain valid until revoked.

## Hardening checklist

- [ ] Strong `JWT_SECRET` (32+ random characters).
- [ ] Bootstrap administrator password changed.
- [ ] HTTPS terminated at the proxy; HSTS enabled.
- [ ] Database not exposed publicly.
- [ ] Backups encrypted and access-controlled.
- [ ] Dependabot, CodeQL and secret scanning enabled.
- [ ] Branch protection requires reviews and passing checks.
- [ ] Audit log reviewed on a schedule.
- [ ] Unused users deactivated and sessions revoked.
- [ ] Upload directory excluded from backups of the web root.
