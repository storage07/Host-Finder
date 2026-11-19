import dotenv from 'dotenv';

dotenv.config();

function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function resolveCliArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('-')) {
    return process.argv[idx + 1];
  }
  const prefix = `${flag}=`;
  const eqArg = process.argv.find((a) => a.startsWith(prefix));
  return eqArg ? eqArg.slice(prefix.length) : undefined;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const cliPort = resolveCliArg('--port');
const cliHost = resolveCliArg('--host');
const resolvedPort = cliPort
  ? toPositiveInt(cliPort, 3000)
  : nodeEnv === 'production'
    ? toPositiveInt(process.env.PORT, 3000)
    : 3000;

const rawMongoUri = (process.env.MONGO_URI || process.env.MONGODB_URI || '').trim();

export const env = {
  PORT: resolvedPort,
  HOST: cliHost || '0.0.0.0',
  NODE_ENV: nodeEnv,
  MONGO_URI: rawMongoUri,
  MONGO_DB_NAME: (process.env.MONGO_DB_NAME || 'host_finder').trim(),
  MONGO_MIN_POOL_SIZE: toPositiveInt(process.env.MONGO_MIN_POOL_SIZE, 2),
  MONGO_MAX_POOL_SIZE: toPositiveInt(process.env.MONGO_MAX_POOL_SIZE, 10),
  MONGO_SERVER_SELECTION_TIMEOUT_MS: toPositiveInt(
    process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
    8000
  ),
  MONGO_SOCKET_TIMEOUT_MS: toPositiveInt(
    process.env.MONGO_SOCKET_TIMEOUT_MS,
    45000
  ),
  MONGO_CONNECT_TIMEOUT_MS: toPositiveInt(
    process.env.MONGO_CONNECT_TIMEOUT_MS,
    10000
  ),
  MONGO_MAX_IDLE_TIME_MS: toPositiveInt(
    process.env.MONGO_MAX_IDLE_TIME_MS,
    30000
  ),
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
