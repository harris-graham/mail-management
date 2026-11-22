# Contributing

## Workflow

1. Create a branch from `main`: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
2. Keep commits small and use Conventional Commits
   (`feat(mail): add bulk visa action`).
3. Open a pull request; the PR template and CI checks are mandatory.
4. At least one CODEOWNER review and all required status checks are required
   before squash-merging.

## Local setup

```bash
cp .env.example .env
docker compose up -d db
npm --prefix server install
npm --prefix client install --legacy-peer-deps
npm --prefix server run db:migrate
npm --prefix server run db:seed
npm --prefix server run dev     # terminal 1
npm --prefix client start       # terminal 2
```

## Quality gates

```bash
npm --prefix server run lint
npm --prefix server test
npm --prefix client run lint
npm --prefix client test -- --watchAll=false
npm --prefix client run build
```

## Database changes

- Add a new numbered SQL file in `server/src/db/migrations/`.
- Never edit an applied migration.
- Include a rollback note in the PR description and update
  `docs/database.md`.
- Run `npm --prefix server run db:migrate` against a disposable database and
  verify the SQLite import still reports matching counts.

## Security

Never commit `.env` files, databases, uploaded documents, tokens or personal
data. Report vulnerabilities privately as described in `SECURITY.md`.
