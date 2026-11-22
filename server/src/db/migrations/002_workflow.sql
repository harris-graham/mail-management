-- ---------------------------------------------------------------------------
-- 002_workflow.sql — assignment history, SLA and reporting helpers
-- ---------------------------------------------------------------------------

CREATE TABLE assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES mail_records (id) ON DELETE CASCADE,
  assigned_to uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES users (id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assignments_record_idx ON assignments (record_id, created_at DESC);
CREATE INDEX assignments_user_idx ON assignments (assigned_to, created_at DESC);

CREATE TABLE mail_watchers (
  record_id uuid NOT NULL REFERENCES mail_records (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (record_id, user_id)
);

CREATE OR REPLACE VIEW mail_overdue AS
SELECT *
FROM mail_records
WHERE due_at IS NOT NULL
  AND due_at < now()
  AND status NOT IN ('processed', 'archived', 'cancelled')
  AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION mail_dashboard_counts(p_from date, p_to date)
RETURNS TABLE (
  type mail_type,
  status mail_status,
  total bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT m.type, m.status, count(*)::bigint
  FROM mail_records m
  WHERE m.deleted_at IS NULL
    AND (m.received_at IS NULL OR m.received_at BETWEEN p_from AND p_to)
  GROUP BY m.type, m.status;
END;
$$ LANGUAGE plpgsql STABLE;
