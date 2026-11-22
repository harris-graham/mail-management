'use strict';

const PREFIXES = {
  correspondance: 'CORR',
  consultation: 'CONS',
  def: 'DEF',
};

async function nextReference(client, type, date = new Date()) {
  const prefix = PREFIXES[type] || 'MAIL';
  const year = date.getFullYear();
  const { rows } = await client.query(
    `INSERT INTO sequences (name, year, last_value)
     VALUES ($1, $2, 1)
     ON CONFLICT (name, year)
     DO UPDATE SET last_value = sequences.last_value + 1
     RETURNING last_value`,
    [prefix, year]
  );
  return `${prefix}-${year}-${String(rows[0].last_value).padStart(6, '0')}`;
}

module.exports = { nextReference, PREFIXES };
