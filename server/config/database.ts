import mongoose, { ConnectOptions } from 'mongoose';
import { env } from './env.js';

const READY_STATE_LABELS: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

let listenersRegistered = false;
let shutdownHooksRegistered = false;
let lastConnectionError = '';
let activeUri = env.MONGO_URI;

export function maskMongoUri(uri: string): string {
  if (!uri) return '(not set)';
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
}

export function validateMongoUri(uri: string): void {
  if (!uri) {
    throw new Error(
      'Missing MongoDB Atlas connection string. Set MONGO_URI (or MONGODB_URI) in .env or AI Studio Secrets.'
    );
  }
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    throw new Error(
      'Invalid MongoDB connection string format. URI must begin with "mongodb://" or "mongodb+srv://".'
    );
  }
}

function buildMongooseOptions(): ConnectOptions {
  const minPool = Math.min(env.MONGO_MIN_POOL_SIZE, env.MONGO_MAX_POOL_SIZE);
  return {
    dbName: env.MONGO_DB_NAME || undefined,
    minPoolSize: minPool,
    maxPoolSize: env.MONGO_MAX_POOL_SIZE,
    serverSelectionTimeoutMS: env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
    socketTimeoutMS: env.MONGO_SOCKET_TIMEOUT_MS,
    connectTimeoutMS: env.MONGO_CONNECT_TIMEOUT_MS,
    maxIdleTimeMS: env.MONGO_MAX_IDLE_TIME_MS,
    retryWrites: true,
    w: 'majority',
    autoIndex: env.NODE_ENV !== 'production',
  };
}

function registerConnectionListeners(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.set('strictQuery', true);

  mongoose.connection.on('connecting', () => {
    console.log(
      `[MongoDB] Connecting to Atlas (${maskMongoUri(activeUri)}) [pool ${env.MONGO_MIN_POOL_SIZE}-${env.MONGO_MAX_POOL_SIZE}]...`
    );
  });

  mongoose.connection.on('connected', () => {
    lastConnectionError = '';
    console.log(
      `[MongoDB] Connected to host "${mongoose.connection.host}" (db: "${mongoose.connection.name}")`
    );
  });

  mongoose.connection.on('reconnected', () => {
    lastConnectionError = '';
    console.log('[MongoDB] Connection re-established with Atlas cluster');
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Disconnected from Atlas cluster');
  });

  mongoose.connection.on('close', () => {
    console.log('[MongoDB] Connection pool closed');
  });

  mongoose.connection.on('error', (err) => {
    lastConnectionError = err.message;
    console.error('[MongoDB] Runtime connection error:', err.message);
  });
}

export async function connectDatabase(
  maxAttempts = 3,
  overrideUri?: string
): Promise<boolean> {
  const uri = (
    overrideUri ??
    process.env.MONGO_URI ??
    process.env.MONGODB_URI ??
    env.MONGO_URI ??
    ''
  ).trim();

  if (!uri) {
    lastConnectionError = '';
    if (env.NODE_ENV !== 'production') {
      console.log(
        '[MongoDB] MONGO_URI not set — running in local preview storage mode until MONGO_URI is provided.'
      );
      return false;
    }
    lastConnectionError =
      'Missing MongoDB Atlas connection string. Set MONGO_URI (or MONGODB_URI) in environment secrets.';
    console.warn(`[MongoDB] ${lastConnectionError}`);
    return false;
  }

  try {
    validateMongoUri(uri);
  } catch (err) {
    lastConnectionError = (err as Error).message;
    console.warn(`[MongoDB] Configuration notice: ${lastConnectionError}`);
    return false;
  }

  activeUri = uri;
  registerConnectionListeners();
  const options = buildMongooseOptions();

  if (mongoose.connection.readyState === 1 && overrideUri) {
    await mongoose.disconnect();
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await mongoose.connect(uri, options);
      lastConnectionError = '';
      return true;
    } catch (err) {
      const msg = (err as Error).message || 'Unknown connection error';
      lastConnectionError = msg;
      console.warn(
        `[MongoDB] Connection attempt ${attempt}/${maxAttempts} failed: ${msg}`
      );
      if (attempt < maxAttempts) {
        const backoffMs = 800 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  return false;
}

export async function disconnectDatabase(signal?: string): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  try {
    if (signal) {
      console.log(`[MongoDB] Received ${signal} — closing connection pool...`);
    }
    await mongoose.disconnect();
  } catch (err) {
    console.warn('[MongoDB] Error closing connection pool:', (err as Error).message);
  }
}

export function registerDatabaseShutdownHooks(): void {
  if (shutdownHooksRegistered) return;
  shutdownHooksRegistered = true;

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, async () => {
      await disconnectDatabase(signal);
      process.exit(0);
    });
  }
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export function isPreviewFallbackActive(): boolean {
  return !isDatabaseConnected() && env.NODE_ENV !== 'production';
}

export function getDatabaseHealth() {
  const stateCode = mongoose.connection.readyState;
  const state = READY_STATE_LABELS[stateCode] || 'unknown';
  const connected = stateCode === 1;
  const previewFallback = !connected && env.NODE_ENV !== 'production';

  return {
    mode: connected ? 'mongodb-atlas' : previewFallback ? 'local-preview' : 'mongodb-atlas',
    readyState: state,
    connected,
    host: mongoose.connection.host || (previewFallback ? 'local-preview-store' : 'unconnected'),
    database: mongoose.connection.name || env.MONGO_DB_NAME,
    lastError: lastConnectionError || undefined,
    pool: {
      minPoolSize: Math.min(env.MONGO_MIN_POOL_SIZE, env.MONGO_MAX_POOL_SIZE),
      maxPoolSize: env.MONGO_MAX_POOL_SIZE,
      socketTimeoutMS: env.MONGO_SOCKET_TIMEOUT_MS,
      serverSelectionTimeoutMS: env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
    },
    info: connected
      ? `Connected to MongoDB Atlas (${mongoose.connection.host}/${mongoose.connection.name}, pool ${env.MONGO_MIN_POOL_SIZE}-${env.MONGO_MAX_POOL_SIZE})`
      : previewFallback
      ? 'Running on local preview storage (.data/host_finder_db.json). Set MONGO_URI to connect MongoDB Atlas.'
      : lastConnectionError || `MongoDB Atlas state: ${state}`,
  };
}
