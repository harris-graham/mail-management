'use strict';

const { ZodError } = require('zod');
const multer = require('multer');
const { AppError } = require('../lib/errors');
const logger = require('../lib/logger');

function notFoundHandler(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  let status = error.status || 500;
  let code = error.code || 'INTERNAL_ERROR';
  let message = error.message || 'Internal server error';
  let details = error.details;

  if (error instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
  } else if (error instanceof multer.MulterError) {
    status = 400;
    code = 'UPLOAD_ERROR';
    message =
      error.code === 'LIMIT_FILE_SIZE'
        ? 'The uploaded file is too large.'
        : error.message;
  } else if (error.code === '23505') {
    status = 409;
    code = 'CONFLICT';
    message = 'A record with these values already exists.';
  } else if (error.code === '23503') {
    status = 400;
    code = 'INVALID_REFERENCE';
    message = 'A referenced record does not exist.';
  } else if (error.code === '22P02') {
    status = 400;
    code = 'INVALID_INPUT';
    message = 'One of the provided values has an invalid format.';
  } else if (error.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large.';
  }

  if (status >= 500) {
    logger.error({ err: error, requestId: req.id }, 'Unhandled request error');
    if (!error.expose) message = 'Internal server error';
  }

  res.status(status).json({
    error: {
      code,
      message,
      details,
      requestId: req.id,
    },
  });
}

module.exports = { notFoundHandler, errorHandler };
