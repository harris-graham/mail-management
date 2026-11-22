'use strict';

const bcrypt = require('bcryptjs');

const ROUNDS = 12;

function validatePasswordPolicy(password) {
  if (typeof password !== 'string' || password.length < 10) {
    return 'Password must contain at least 10 characters.';
  }
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain a digit.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain a symbol.';
  return null;
}

async function hashPassword(password) {
  return bcrypt.hash(password, ROUNDS);
}

async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

module.exports = { hashPassword, verifyPassword, validatePasswordPolicy };
