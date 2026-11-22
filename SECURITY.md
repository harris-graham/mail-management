# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Use GitHub's private vulnerability reporting:

1. Open the repository **Security** tab.
2. Choose **Advisories** → **Report a vulnerability**.
3. Include the affected endpoint/component, reproduction steps, impact and any
   suggested fix.

You can also contact the maintainers listed in `CODEOWNERS`. We aim to
acknowledge reports within 3 business days and to ship a fix within 30 days for
confirmed high-severity issues.

## Security controls in this project

- Argon2-compatible password hashing (bcryptjs) and password policy enforcement.
- Short-lived JWT access tokens plus rotating, hashed refresh tokens in
  `HttpOnly`, `SameSite=Strict` cookies.
- TOTP multi-factor authentication with hashed recovery codes.
- Role-based access control and per-record department scoping.
- Zod validation on every write endpoint.
- Helmet security headers, CORS allow-list, rate limiting and request IDs.
- Immutable audit log for authentication and record mutations.
- File type/size allow-list for attachments and SHA-256 integrity checks.
- Secrets are environment-only; `.env`, databases and uploads are git-ignored.

## Hardening checklist for deployments

- [ ] Generate `JWT_SECRET` with `openssl rand -hex 48`.
- [ ] Use a dedicated PostgreSQL role with the minimum required privileges.
- [ ] Terminate TLS at a reverse proxy and set `TRUST_PROXY=1`.
- [ ] Restrict `CORS_ORIGINS` to the real UI origin.
- [ ] Enable PostgreSQL backups and test restores quarterly.
- [ ] Keep `npm audit`/Dependabot clean and review CodeQL alerts.
- [ ] Rotate the bootstrap administrator password after first login.
