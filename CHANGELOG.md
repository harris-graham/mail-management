# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- PostgreSQL 17 schema, SQL migrations and SQLite import tooling.
- Rotating refresh tokens, TOTP MFA, RBAC and immutable audit log.
- Mail workflow state machine, SLA tracking, comments and attachments.
- Full-text search, analytics, PDF/XLSX/CSV exports and QR codes.
- Real-time notifications over Socket.IO and optional SMTP/IMAP integration.
- React UI with authentication context, dark mode and French/English locales.
- Docker Compose stack, health checks and GitHub Actions pipelines.

### Changed

- Replaced the callback-based SQLite data layer with parameterised `pg` queries.
- Reorganised the Express application into routes, services and middleware.

### Fixed

- Plaintext passwords, missing route authorization and hard-coded JWT secret.
- Archive copies now preserve column mapping through explicit SQL.
- Errors are returned consistently instead of being swallowed.
