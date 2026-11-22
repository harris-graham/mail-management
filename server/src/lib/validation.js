'use strict';

const { z } = require('zod');
const { badRequest } = require('./errors');

function validate(schemas) {
  return function validationMiddleware(req, res, next) {
    try {
      const validated = {};
      for (const source of ['params', 'query', 'body']) {
        if (schemas[source]) {
          const result = schemas[source].safeParse(req[source]);
          if (!result.success) {
            throw badRequest(
              'Validation failed',
              result.error.issues.map((issue) => ({
                path: issue.path.join('.'),
                message: issue.message,
              }))
            );
          }
          validated[source] = result.data;
        }
      }
      req.validated = validated;
      next();
    } catch (error) {
      next(error);
    }
  };
}

const uuid = z.string().uuid();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const optionalDate = dateString.optional().nullable();

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
};

const mailTypes = ['correspondance', 'consultation', 'def'];
const mailStatuses = [
  'draft',
  'registered',
  'analyzed',
  'pending_visa',
  'visa_approved',
  'visa_rejected',
  'assigned',
  'in_progress',
  'processed',
  'archived',
  'cancelled',
];
const priorities = ['low', 'normal', 'high', 'urgent'];
const confidentialityLevels = ['public', 'internal', 'confidential', 'secret'];

module.exports = {
  validate,
  uuid,
  dateString,
  optionalDate,
  pagination,
  mailTypes,
  mailStatuses,
  priorities,
  confidentialityLevels,
};
