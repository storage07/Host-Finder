import cookieParser from 'cookie-parser';
import express from 'express';
import fs from 'fs';
import helmet from 'helmet';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  connectDatabase,
  getDatabaseHealth,
  isDatabaseConnected,
  isPreviewFallbackActive,
  registerDatabaseShutdownHooks,
} from './server/config/database.js';
import { env } from './server/config/env.js';
import { ensureSeededOnce, seedDatabase } from './server/db/seed.js';
import { sanitizeRequestMiddleware } from './server/middleware/auth.js';
import authRoutes from './server/routes/auth.js';
import financeAndOpsRoutes from './server/routes/financeAndOps.js';
import resourceRoutes from './server/routes/resources.js';
import { startExpiryCron } from './server/services/statusAndCron.js';
import { isSqlConfigured } from './src/db/index.ts';

let dbInitializing = !isSqlConfigured();

async function initializeDatabaseAsync() {
  if (isSqlConfigured()) {
    dbInitializing = false;
    startExpiryCron();
    return;
  }
  dbInitializing = true;
  try {
    await connectDatabase();
    await seedDatabase();
    startExpiryCron();
  } catch (err) {
    console.warn('[Host Finder] Database initialization notice:', (err as Error).message);
  } finally {
    dbInitializing = false;
  }
}

async function bootstrap() {
  if (!isSqlConfigured()) {
    registerDatabaseShutdownHooks();
  }

  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      frameguard: false,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(sanitizeRequestMiddleware);

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    if (isSqlConfigured()) {
      return res.status(200).json({
        ok: true,
        service: 'host-finder-api',
      });
    }
    const dbHealth = getDatabaseHealth();
    res.status(200).json({
      ok: true,
      service: 'host-finder-api',
      dbInitializing,
      dbConnected: dbHealth.connected,
      previewFallback: isPreviewFallbackActive(),
      database: dbHealth,
    });
  });

  app.post('/api/system/reconnect-db', async (req, res) => {
    if (isSqlConfigured()) {
      return res.status(200).json({ connected: true });
    }
    const customUri = typeof req.body?.uri === 'string' ? req.body.uri.trim() : undefined;
    const ok = await connectDatabase(1, customUri);
    if (ok) {
      await seedDatabase();
    }
    const dbHealth = getDatabaseHealth();
    return res.status(ok ? 200 : 400).json({
      connected: ok,
      database: dbHealth,
    });
  });

  // Lazy seeding & connection gate for /api routes
  app.use('/api', async (req, res, next) => {
    if (req.path === '/health' || req.path === '/system/reconnect-db') {
      return next();
    }
    if (isSqlConfigured()) {
      try {
        await ensureSeededOnce();
      } catch (err) {
        console.error('Lazy initialization error:', err);
      }
      return next();
    }
    if (!isDatabaseConnected() && !isPreviewFallbackActive()) {
      const health = getDatabaseHealth();
      return res.status(503).json({
        error: dbInitializing
          ? 'Connecting to database...'
          : health.lastError || 'Database connection unavailable.',
        dbDisconnected: true,
        dbInitializing,
      });
    }
    next();
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api', resourceRoutes);
  app.use('/api', financeAndOpsRoutes);

  // Serve Vite dev middleware in development or built static assets in production
  let viteServerPromise: ReturnType<typeof createViteServer> | null = null;
  if (env.NODE_ENV !== 'production') {
    viteServerPromise = createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : undefined,
      },
      appType: 'spa',
    });

    app.use(async (req, res, next) => {
      try {
        const vite = await viteServerPromise!;
        return vite.middlewares(req, res, next);
      } catch (err) {
        return next(err);
      }
    });
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  const server = app.listen(env.PORT, env.HOST, () => {
    console.log(`[Host Finder] Server listening on http://${env.HOST}:${env.PORT}`);
    void initializeDatabaseAsync();
  });

  const gracefulShutdown = async () => {
    try {
      if (viteServerPromise) {
        const vite = await viteServerPromise.catch(() => null);
        await vite?.close();
      }
    } finally {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 2000).unref();
    }
  };

  process.once('SIGTERM', () => {
    void gracefulShutdown();
  });
  process.once('SIGINT', () => {
    void gracefulShutdown();
  });
}

bootstrap().catch((err) => {
  console.error('[Host Finder] Fatal startup error:', err);
  process.exit(1);
});
