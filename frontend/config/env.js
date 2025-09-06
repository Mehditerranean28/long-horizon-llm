const Joi = require('joi');
require('dotenv').config({ path: '.env', debug: process.env.NODE_ENV !== 'production' });

const ENV_SCHEMA = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().integer().min(1024).max(65535).default(3000),
  MONGODB_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .when('NODE_ENV', { is: 'test', then: Joi.string().default('mongodb://localhost/test'), otherwise: Joi.required() }),
  SESSION_SECRET: Joi.string()
    .min(64)
    .hex()
    .when('NODE_ENV', { is: 'test', then: Joi.string().default('a'.repeat(64)), otherwise: Joi.required() }),
  STRIPE_SECRET_KEY: Joi.string()
    .pattern(/^sk_test_|^sk_live_/)
    .min(32)
    .when('NODE_ENV', { is: 'test', then: Joi.string().default('sk_test_dummykey1234567890123456789012'), otherwise: Joi.required() }),
  STRIPE_PRICE_ID: Joi.string()
    .min(5)
    .when('NODE_ENV', { is: 'test', then: Joi.string().default('price_12345'), otherwise: Joi.required() }),
  STRIPE_WEBHOOK_SECRET: Joi.string()
    .pattern(/^whsec_/)
    .min(10)
    .when('NODE_ENV', { is: 'test', then: Joi.string().default('whsec_testsecret'), otherwise: Joi.required() }),
  BACKEND_HTTP_URL: Joi.string()
    .uri()
    .when('NODE_ENV', { is: 'test', then: Joi.string().default('http://localhost:3000'), otherwise: Joi.required() }),
  BACKEND_WS_URL: Joi.string()
    .uri({ scheme: ['ws', 'wss'] })
    .when('NODE_ENV', { is: 'test', then: Joi.string().default('ws://localhost:3001'), otherwise: Joi.optional() }),
  SOVEREIGN_WS_URL: Joi.string().uri({ scheme: ['ws', 'wss'] }).optional(),
  TASK_CONCURRENCY_PER_USER: Joi.number().integer().min(1).default(2),
  SMTP_URL: Joi.string().uri({ scheme: ['smtp', 'smtps'] }).optional(),
  SUPPORT_EMAIL: Joi.string().email().default('hmidimahdi279@gmail.com'),
}).or('BACKEND_WS_URL', 'SOVEREIGN_WS_URL').unknown(true);

const { error, value } = ENV_SCHEMA.validate(process.env, { abortEarly: false, allowUnknown: true });
if (error) {
  throw new Error('Invalid environment configuration: ' + error.message);
}

const WS_URL = value.BACKEND_WS_URL || value.SOVEREIGN_WS_URL;
const DEV = value.NODE_ENV !== 'production';

module.exports = {
  ...value,
  WS_URL,
  DEV,
  USER_CONCURRENCY: value.TASK_CONCURRENCY_PER_USER,
  SMTP_URL: value.SMTP_URL,
  SUPPORT_EMAIL: value.SUPPORT_EMAIL,
};
