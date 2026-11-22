# Government Mail Management

A production-grade mail registry for government correspondence, consultation
requests and financial engagement requests.

## Quick links

- [Architecture](architecture.md)
- [Database](database.md)
- [API](api.md)
- [Operations](operations.md)
- [Security](security.md)
- [GitHub](github.md)

## Stack

| Layer      | Technology                                      |
| ---------- | ----------------------------------------------- |
| Frontend   | React 18, MUI 5, i18next, Socket.IO client       |
| Backend    | Node.js 22+, Express 4, Zod, Pino                |
| Database   | PostgreSQL 17, SQL migrations, full-text search  |
| Auth       | JWT access tokens, rotating refresh cookies, TOTP |
| Delivery   | Docker Compose, GitHub Actions, GHCR, Pages      |

## Local start

```bash
cp .env.example .env
docker compose up -d db
npm --prefix server install
npm --prefix client install --legacy-peer-deps
npm --prefix server run db:migrate
npm --prefix server run db:seed
npm --prefix server run dev
npm --prefix client start
```

The API listens on `http://localhost:5000` and the UI on
`http://localhost:3000`.
