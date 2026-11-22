'use strict';

const { query } = require('../db/pool');
const logger = require('./logger');

async function audit({
  actorId = null,
  action,
  entity,
  entityId = null,
  oldValues = null,
  newValues = null,
  req = null,
  client = null,
}) {
  try {
    const runner = client || { query };
    await runner.query(
      `INSERT INTO audit_log
        (actor_id, action, entity, entity_id, old_values, new_values, ip, user_agent, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        actorId,
        action,
        entity,
        entityId == null ? null : String(entityId),
        oldValues,
        newValues,
        req?.ip || null,
        req?.get?.('user-agent') || null,
        req?.id || null,
      ]
    );
  } catch (error) {
    logger.error({ err: error, action, entity }, 'Failed to write audit entry');
  }
}

module.exports = { audit };
