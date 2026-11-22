/**
 * Loads environment variables from .env (via dotenv) and exposes one frozen
 * config object. The app fails fast at startup if a required secret is missing,
 * instead of failing later on the first login.
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: process.env.DOTENV_PATH || path.resolve(process.cwd(), '.env') });

const REQUIRED = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}. ` +
      'Copy .env.example to .env and fill in the values.'
  );
}

if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.');
}

const env = process.env.NODE_ENV || 'development';

const config = Object.freeze({
  env,
  isProduction: env === 'production',
  isTest: env === 'test',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI,
  jwt: Object.freeze({
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  }),
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX) || 100,
  sweeperIntervalMs: (Number(process.env.SWEEPER_INTERVAL_SECONDS) || 30) * 1000,
});

module.exports = config;
