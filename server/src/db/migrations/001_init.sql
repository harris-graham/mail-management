-- ---------------------------------------------------------------------------
-- 001_init.sql — core schema for the government mail management platform
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'agent', 'consultation', 'archivist');
CREATE TYPE mail_type AS ENUM ('correspondance', 'consultation', 'def');
CREATE TYPE mail_status AS ENUM (
  'draft', 'registered', 'analyzed', 'pending_visa', 'visa_approved',
  'visa_rejected', 'assigned', 'in_progress', 'processed', 'archived', 'cancelled'
);
CREATE TYPE priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE confidentiality AS ENUM ('public', 'internal', 'confidential', 'secret');
CREATE TYPE event_type AS ENUM (
  'created', 'updated', 'status_changed', 'assigned', 'commented',
  'attachment_added', 'attachment_removed', 'visa_approved', 'visa_rejected',
  'archived', 'restored', 'deleted', 'login', 'logout', 'exported',
  'imported', 'backup', 'mfa_enabled', 'password_changed'
);
CREATE TYPE notification_type AS ENUM (
  'info', 'assignment', 'status', 'deadline', 'mention', 'system'
);

-- Reference data -----------------------------------------------------------

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  parent_id uuid REFERENCES departments (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ministries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry_id uuid NOT NULL REFERENCES ministries (id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ministry_id, code)
);

CREATE TABLE natures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Identity and access ------------------------------------------------------

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matricule text NOT NULL UNIQUE,
  username text NOT NULL,
  full_name text NOT NULL,
  email text,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'agent',
  department_id uuid REFERENCES departments (id) ON DELETE SET NULL,
  ministry_id uuid REFERENCES ministries (id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  mfa_secret text,
  mfa_enabled boolean NOT NULL DEFAULT false,
  mfa_recovery_codes text[] NOT NULL DEFAULT '{}',
  failed_login_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX users_username_lower_idx
  ON users (lower(username)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX users_email_lower_idx
  ON users (lower(email)) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX users_department_idx ON users (department_id);
CREATE INDEX users_role_idx ON users (role);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by uuid,
  user_agent text,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Mail records -------------------------------------------------------------

CREATE TABLE mail_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  type mail_type NOT NULL,
  status mail_status NOT NULL DEFAULT 'registered',
  priority priority NOT NULL DEFAULT 'normal',
  confidentiality confidentiality NOT NULL DEFAULT 'internal',
  subject text,
  analysis text,
  observation text,
  bordereau text,
  projet_vise text,
  ministry_id uuid REFERENCES ministries (id) ON DELETE SET NULL,
  service_id uuid REFERENCES services (id) ON DELETE SET NULL,
  nature_id uuid REFERENCES natures (id) ON DELETE SET NULL,
  department_id uuid REFERENCES departments (id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES users (id) ON DELETE SET NULL,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  received_at date,
  deposited_at date,
  decided_at date,
  due_at timestamptz,
  closed_at timestamptz,
  archived_at timestamptz,
  legacy_key text UNIQUE,
  legacy_id integer,
  legacy_archive_id integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_vector tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX mail_status_idx ON mail_records (status);
CREATE INDEX mail_type_idx ON mail_records (type);
CREATE INDEX mail_department_idx ON mail_records (department_id);
CREATE INDEX mail_assigned_idx ON mail_records (assigned_to);
CREATE INDEX mail_created_by_idx ON mail_records (created_by);
CREATE INDEX mail_ministry_idx ON mail_records (ministry_id);
CREATE INDEX mail_nature_idx ON mail_records (nature_id);
CREATE INDEX mail_received_idx ON mail_records (received_at DESC);
CREATE INDEX mail_due_idx ON mail_records (due_at) WHERE due_at IS NOT NULL;
CREATE INDEX mail_search_idx ON mail_records USING GIN (search_vector);
CREATE INDEX mail_reference_trgm_idx ON mail_records USING GIN (reference gin_trgm_ops);

CREATE TABLE mail_events (
  id bigserial PRIMARY KEY,
  record_id uuid NOT NULL REFERENCES mail_records (id) ON DELETE CASCADE,
  event_type event_type NOT NULL,
  from_status mail_status,
  to_status mail_status,
  actor_id uuid REFERENCES users (id) ON DELETE SET NULL,
  comment text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mail_events_record_idx ON mail_events (record_id, created_at DESC);
CREATE INDEX mail_events_actor_idx ON mail_events (actor_id);

CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES mail_records (id) ON DELETE CASCADE,
  filename text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  storage_key text NOT NULL,
  sha256 text NOT NULL,
  uploaded_by uuid REFERENCES users (id) ON DELETE SET NULL,
  ocr_text text,
  ocr_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX attachments_record_idx ON attachments (record_id) WHERE deleted_at IS NULL;

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES mail_records (id) ON DELETE CASCADE,
  author_id uuid REFERENCES users (id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX comments_record_idx ON comments (record_id, created_at);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  record_id uuid REFERENCES mail_records (id) ON DELETE CASCADE,
  type notification_type NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  ip inet,
  user_agent text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_created_idx ON audit_log (created_at DESC);
CREATE INDEX audit_entity_idx ON audit_log (entity, entity_id);
CREATE INDEX audit_actor_idx ON audit_log (actor_id, created_at DESC);

CREATE TABLE saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name text NOT NULL,
  query jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Integrations and operations ---------------------------------------------

CREATE TABLE email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  host text NOT NULL,
  port integer NOT NULL DEFAULT 993,
  secure boolean NOT NULL DEFAULT true,
  username text NOT NULL,
  password_encrypted text NOT NULL,
  folder text NOT NULL DEFAULT 'INBOX',
  active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES email_accounts (id) ON DELETE CASCADE,
  message_id text UNIQUE,
  subject text,
  from_address text,
  to_address text,
  received_at timestamptz,
  processed boolean NOT NULL DEFAULT false,
  record_id uuid REFERENCES mail_records (id) ON DELETE SET NULL,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  secret text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}',
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mail_type mail_type,
  retention_days integer NOT NULL,
  action text NOT NULL DEFAULT 'archive',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sequences (
  name text NOT NULL,
  year integer NOT NULL,
  last_value bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (name, year)
);

-- Raw rows retained from legacy SQLite tables that are not used by the app.
CREATE TABLE legacy_rows (
  id bigserial PRIMARY KEY,
  source_table text NOT NULL,
  row_key text,
  data jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, row_key)
);

-- Triggers -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mail_records_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('french', coalesce(NEW.reference, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(NEW.subject, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(NEW.analysis, '')), 'B') ||
    setweight(to_tsvector('french', coalesce(NEW.observation, '')), 'C') ||
    setweight(to_tsvector('french', coalesce(NEW.bordereau, '')), 'C') ||
    setweight(to_tsvector('french', coalesce(NEW.projet_vise, '')), 'C') ||
    setweight(to_tsvector('french', coalesce(NEW.metadata::text, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER departments_updated_at BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER ministries_updated_at BEFORE UPDATE ON ministries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER services_updated_at BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER natures_updated_at BEFORE UPDATE ON natures
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER mail_records_updated_at BEFORE UPDATE ON mail_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER comments_updated_at BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER email_accounts_updated_at BEFORE UPDATE ON email_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER settings_updated_at BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER mail_records_search BEFORE INSERT OR UPDATE OF
  reference, subject, analysis, observation, bordereau, projet_vise, metadata
  ON mail_records
  FOR EACH ROW EXECUTE FUNCTION mail_records_search_update();
