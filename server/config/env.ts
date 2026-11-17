import dotenv from 'dotenv';

dotenv.config();

export const env = {
  PORT: Number(process.env.PORT || 3000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGO_URI: (process.env.MONGO_URI || '').trim(),
  JWT_SECRET:
    process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16
      ? process.env.JWT_SECRET
      : 'host-finder-dev-jwt-secret-change-in-production-2026',
  ENCRYPTION_KEY:
    process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 16
      ? process.env.ENCRYPTION_KEY
      : 'host-finder-dev-aes256-key-2026!',
  ADMIN_INITIAL_PASSWORD:
    process.env.ADMIN_INITIAL_PASSWORD || 'HostFinder@2026!',
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
};
