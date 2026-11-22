const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./mail_management.db', (err) => { if (err) console.error(err.message); });

module.exports = db;