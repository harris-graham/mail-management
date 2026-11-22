'use strict';

const { query } = require('../db/pool');
const { accessClause } = require('./mailService');

function scope(user, filters = {}) {
  const params = [];
  const where = ['m.deleted_at IS NULL'];
  if (filters.from) {
    where.push(`COALESCE(m.received_at, m.created_at::date) >= $${params.push(filters.from)}::date`);
  }
  if (filters.to) {
    where.push(`COALESCE(m.received_at, m.created_at::date) <= $${params.push(filters.to)}::date`);
  }
  if (filters.type) {
    where.push(`m.type = $${params.push(filters.type)}::mail_type`);
  }
  where.push(...accessClause(user, params));
  return { whereSql: where.join(' AND '), params };
}

async function summary(user, filters = {}) {
  const { whereSql, params } = scope(user, filters);
  const { rows } = await query(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE m.status = 'registered')::int AS registered,
       count(*) FILTER (WHERE m.status = 'pending_visa')::int AS pending_visa,
       count(*) FILTER (WHERE m.status = 'visa_approved')::int AS visa_approved,
       count(*) FILTER (WHERE m.status = 'visa_rejected')::int AS visa_rejected,
       count(*) FILTER (WHERE m.status = 'assigned')::int AS assigned,
       count(*) FILTER (WHERE m.status = 'in_progress')::int AS in_progress,
       count(*) FILTER (WHERE m.status = 'processed')::int AS processed,
       count(*) FILTER (WHERE m.status = 'archived')::int AS archived,
       count(*) FILTER (
         WHERE m.due_at < now()
           AND m.status NOT IN ('processed', 'archived', 'cancelled')
       )::int AS overdue,
       count(*) FILTER (WHERE m.received_at = current_date)::int AS today,
       count(*) FILTER (
         WHERE date_trunc('month', m.received_at) = date_trunc('month', current_date)
       )::int AS this_month,
       count(*) FILTER (
         WHERE date_trunc('quarter', m.received_at) = date_trunc('quarter', current_date)
       )::int AS this_quarter,
       count(*) FILTER (
         WHERE date_trunc('year', m.received_at) = date_trunc('year', current_date)
       )::int AS this_year,
       round(avg(EXTRACT(EPOCH FROM (m.closed_at - m.created_at)) / 3600)
         FILTER (WHERE m.closed_at IS NOT NULL)::numeric, 1) AS avg_processing_hours
     FROM mail_records m
     WHERE ${whereSql}`,
    params
  );
  return rows[0];
}

async function timeseries(user, filters = {}) {
  const interval = ['day', 'week', 'month', 'quarter', 'year'].includes(filters.interval)
    ? filters.interval
    : 'month';
  const { whereSql, params } = scope(user, filters);
  const { rows } = await query(
    `SELECT date_trunc($1, COALESCE(m.received_at, m.created_at::date)) AS bucket,
            m.type, count(*)::int AS count
     FROM mail_records m
     WHERE ${whereSql}
     GROUP BY 1, 2
     ORDER BY 1 ASC`,
    [interval, ...params]
  );
  return rows;
}

async function byDimension(user, dimension, filters = {}) {
  const dimensions = {
    nature: { join: 'LEFT JOIN natures n ON n.id = m.nature_id', label: 'n.name', key: 'nature_id' },
    ministry: {
      join: 'LEFT JOIN ministries mi ON mi.id = m.ministry_id',
      label: 'mi.name',
      key: 'ministry_id',
    },
    service: {
      join: 'LEFT JOIN services s ON s.id = m.service_id',
      label: 's.name',
      key: 'service_id',
    },
    agent: {
      join: 'LEFT JOIN users u ON u.id = m.assigned_to',
      label: 'u.full_name',
      key: 'assigned_to',
    },
    status: { join: '', label: 'm.status::text', key: 'status' },
    type: { join: '', label: 'm.type::text', key: 'type' },
  };
  const selected = dimensions[dimension] || dimensions.nature;
  const { whereSql, params } = scope(user, filters);
  const { rows } = await query(
    `SELECT ${selected.label} AS label, count(*)::int AS count
     FROM mail_records m ${selected.join}
     WHERE ${whereSql}
     GROUP BY 1
     ORDER BY count DESC
     LIMIT 25`,
    params
  );
  return rows;
}

async function sla(user, filters = {}) {
  const { whereSql, params } = scope(user, filters);
  const { rows } = await query(
    `SELECT m.priority,
            count(*)::int AS total,
            count(*) FILTER (
              WHERE m.due_at IS NOT NULL AND m.due_at < now()
                AND m.status NOT IN ('processed', 'archived', 'cancelled')
            )::int AS overdue,
            round(avg(EXTRACT(EPOCH FROM (m.closed_at - m.created_at)) / 3600)
              FILTER (WHERE m.closed_at IS NOT NULL)::numeric, 1) AS avg_hours
     FROM mail_records m
     WHERE ${whereSql}
     GROUP BY m.priority
     ORDER BY m.priority`,
    params
  );
  return rows;
}

async function agentWorkload(user, filters = {}) {
  const { whereSql, params } = scope(user, filters);
  const { rows } = await query(
    `SELECT u.id, u.full_name, u.matricule,
            count(*)::int AS total,
            count(*) FILTER (WHERE m.status IN ('assigned', 'in_progress'))::int AS active,
            count(*) FILTER (
              WHERE m.due_at < now()
                AND m.status NOT IN ('processed', 'archived', 'cancelled')
            )::int AS overdue
     FROM mail_records m
     JOIN users u ON u.id = m.assigned_to
     WHERE ${whereSql}
     GROUP BY u.id, u.full_name, u.matricule
     ORDER BY active DESC, total DESC`,
    params
  );
  return rows;
}

module.exports = { summary, timeseries, byDimension, sla, agentWorkload, scope };
