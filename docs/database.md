# Database

## Engine

PostgreSQL 17 is the system of record. The schema relies on:

- native `uuid` keys (`gen_random_uuid()`),
- enum types for roles, statuses, priorities and confidentiality,
- `jsonb` for metadata and audit payloads,
- `tsvector` full-text search with French configuration,
- `pg_trgm` for fuzzy reference matching,
- `unaccent` for diacritic-insensitive search.

## Migrations

Migrations are plain SQL files in `server/src/db/migrations`, applied in
lexicographic order and recorded in `schema_migrations`.

```bash
npm --prefix server run db:migrate
```

Rules:

1. Never edit an applied migration; add a new numbered file.
2. Wrap destructive changes in a reversible plan or a backup step.
3. Add indexes for new foreign keys and query filters.
4. Keep timestamps `timestamptz`.
5. Use `ON DELETE SET NULL` or `CASCADE` deliberately.

## Tables

| Table | Purpose |
| --- | --- |
| `departments`, `ministries`, `services` | Organizational reference data |
| `natures` | Mail nature catalog (667 imported natures) |
| `users` | Accounts, roles, MFA and lockout state |
| `refresh_tokens` | Hashed rotating refresh tokens |
| `password_reset_tokens` | One-time reset links |
| `mail_records` | Correspondence, consultations and DEFs |
| `mail_events` | Immutable per-record history |
| `attachments` | Stored documents and OCR text |
| `comments` | Threaded comments per record |
| `notifications` | In-app notifications |
| `audit_log` | Security and business audit trail |
| `saved_searches` | Per-user search presets |
| `settings` | Runtime configuration (`jsonb`) |
| `email_accounts`, `email_messages` | IMAP ingestion |
| `webhooks`, `api_keys` | Integrations |
| `retention_policies` | Future retention automation |
| `sequences` | Yearly reference counters |
| `legacy_rows` | Raw rows kept from unused SQLite tables |

## Enumerations

```text
user_role        admin | supervisor | agent | consultation | archivist
mail_type        correspondance | consultation | def
mail_status      draft | registered | analyzed | pending_visa |
                 visa_approved | visa_rejected | assigned | in_progress |
                 processed | archived | cancelled
priority         low | normal | high | urgent
confidentiality  public | internal | confidential | secret
event_type       created | updated | status_changed | assigned | commented |
                 attachment_added | attachment_removed | visa_approved |
                 visa_rejected | archived | restored | deleted | login |
                 logout | exported | imported | backup | mfa_enabled |
                 password_changed
notification_type info | assignment | status | deadline | mention | system
```

## Search

`mail_records.search_vector` is maintained by a trigger and weighted:

| Weight | Fields |
| --- | --- |
| A | `reference`, `subject` |
| B | `analysis` |
| C | `observation`, `bordereau`, `projet_vise` |
| D | `metadata` |

Queries combine `websearch_to_tsquery('french', $1)` with a `pg_trgm`
similarity check on the reference.

## Importing the legacy SQLite database

`server/scripts/migrate-sqlite.mjs` reads `utilisateur`, `nature`,
`correspondance`, `archive`, `consultation`, `def` and `visa` from SQLite and
writes normalized PostgreSQL rows.

- Idempotent: rows are keyed by `legacy_key` (`correspondance:<id>`,
  `archive:<id>`, `consultation:<id>`, `def:<id>`).
- Original rows are preserved in `metadata` for auditability.
- Unused tables are copied verbatim to `legacy_rows`.
- Users keep their legacy password (hashed with bcrypt) and are forced to
  change it on first login.
- Archives are merged into their source correspondence and marked `archived`.

```bash
npm --prefix server run db:import -- server/mail_management.db
```

## Backup and restore

```bash
npm --prefix server run db:backup
```

The backup script exports a JSON snapshot per table. For full-fidelity
backups in production, also run `pg_dump` on a schedule.

## Reset

```bash
npm --prefix server run db:reset   # drops and recreates the schema
npm --prefix server run db:migrate
npm --prefix server run db:seed
```
