'use strict';

const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({
  path: process.env.ENV_FILE || [
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../.env'),
  ],
});

const boolean = (defaultValue) =>
  z
    .enum(['true', 'false'])
    .default(defaultValue ? 'true' : 'false')
    .transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgres://mail:mail@localhost:5432/mail_management'),
  DB_SSL: boolean(false),
  JWT_SECRET: z
    .string()
    .min(32)
    .default('dev-only-secret-change-me-please-32-chars'),
  JWT_ISSUER: z.string().default('mail-management'),
  JWT_AUDIENCE: z.string().default('mail-management-web'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  UPLOAD_DIR: z.string().default(path.resolve(__dirname, '../../uploads')),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(25),
  ADMIN_MATRICULE: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().default('Admin@12345'),
  ADMIN_EMAIL: z.string().default('admin@example.gov'),
  ADMIN_FULL_NAME: z.string().default('Administrateur Système'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: boolean(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('no-reply@example.gov'),
  IMAP_HOST: z.string().optional(),
  IMAP_PORT: z.coerce.number().int().positive().default(993),
  IMAP_SECURE: boolean(true),
  IMAP_USER: z.string().optional(),
  IMAP_PASSWORD: z.string().optional(),
  IMAP_FOLDER: z.string().default('INBOX'),
  LOG_LEVEL: z.string().default('info'),
  ENABLE_SCHEDULER: boolean(true),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const config = parsed.data;
config.CORS_ORIGINS_LIST = config.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (
  config.NODE_ENV === 'production' &&
  config.JWT_SECRET.startsWith('dev-only')
) {
  console.error('JWT_SECRET must be set to a strong random value in production.');
  process.exit(1);
}

module.exports = config;
