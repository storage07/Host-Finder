import cookieParser from 'cookie-parser';
import express from 'express';
import fs from 'fs';
import helmet from 'helmet';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { env } from './server/config/env.js';
import { seedDatabase } from './server/db/seed.js';
import { connectDatabase } from './server/db/store.js';
import { sanitizeRequestMiddleware } from './server/middleware/auth.js';
import authRoutes from './server/routes/auth.js';
import financeAndOpsRoutes from './server/routes/financeAndOps.js';
import resourceRoutes from './server/routes/resources.js';
import { startExpiryCron } from './server/services/statusAndCron.js';

async function bootstrap() {
  await connectDatabase();
  await seedDatabase();
  startExpiryCron();

  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(sanitizeRequestMiddleware);

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api', resourceRoutes);
  app.use('/api', financeAndOpsRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'host-finder-api' });
  });

  // Serve Vite dev middleware in development or built static assets in production
  if (env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`[Host Finder] Server listening on http://0.0.0.0:${env.PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('[Host Finder] Fatal startup error:', err);
  process.exit(1);
});
