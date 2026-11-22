'use strict';

const path = require('path');
const { randomUUID } = require('crypto');
const multer = require('multer');
const config = require('../config/env');
const { ensureUploadDir } = require('../lib/storage');
const { AppError } = require('../lib/errors');

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/tiff',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
]);

const storage = multer.diskStorage({
  destination(req, file, callback) {
    ensureUploadDir()
      .then(() => callback(null, config.UPLOAD_DIR))
      .catch(callback);
  },
  filename(req, file, callback) {
    const extension = path.extname(file.originalname).slice(0, 12).toLowerCase();
    callback(null, `${randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.MAX_UPLOAD_MB * 1024 * 1024,
    files: 5,
  },
  fileFilter(req, file, callback) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return callback(
        new AppError(400, 'UNSUPPORTED_FILE_TYPE', `Unsupported file type: ${file.mimetype}`)
      );
    }
    callback(null, true);
  },
});

module.exports = { upload, ALLOWED_MIME_TYPES };
