'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config/env');

async function ensureUploadDir() {
  await fs.mkdir(config.UPLOAD_DIR, { recursive: true });
}

function absolutePath(storageKey) {
  const resolved = path.resolve(config.UPLOAD_DIR, storageKey);
  if (!resolved.startsWith(path.resolve(config.UPLOAD_DIR))) {
    throw new Error('Invalid storage key');
  }
  return resolved;
}

async function readFile(storageKey) {
  return fs.readFile(absolutePath(storageKey));
}

async function removeFile(storageKey) {
  try {
    await fs.unlink(absolutePath(storageKey));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function checksum(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = { ensureUploadDir, absolutePath, readFile, removeFile, checksum };
