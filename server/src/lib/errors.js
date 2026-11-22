'use strict';

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }
}

const badRequest = (message, details) =>
  new AppError(400, 'BAD_REQUEST', message, details);
const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);
const forbidden = (message = 'Insufficient permissions') =>
  new AppError(403, 'FORBIDDEN', message);
const notFound = (message = 'Resource not found') =>
  new AppError(404, 'NOT_FOUND', message);
const conflict = (message, details) =>
  new AppError(409, 'CONFLICT', message, details);
const tooManyRequests = (message = 'Too many requests') =>
  new AppError(429, 'TOO_MANY_REQUESTS', message);
const internal = (message = 'Internal server error') =>
  new AppError(500, 'INTERNAL_ERROR', message);

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  tooManyRequests,
  internal,
};
