import express from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRoutes } from './routes/auth.routes.js';
import { modelsRoutes } from './routes/models.routes.js';
import { subscriptionsRoutes } from './routes/subscriptions.routes.js';
import { commentsRoutes } from './routes/comments.routes.js';

export function createApp() {
  const app = express();
  // So req.secure and req.get('x-forwarded-proto') reflect the client-facing URL (ngrok, production proxies).
  app.set('trust proxy', 1);

  app.use(corsMiddleware);
  app.use(cookieParser());
  // Allow large payloads for /api/models/generate (base64 images, e.g. 50+ photos)
  app.use(express.json({ limit: '200mb' }));
  app.use(express.urlencoded({ extended: true, limit: '200mb' }));
  app.use(morgan('dev'));

  app.use('/api/auth', authRoutes);
  app.use('/api/models', modelsRoutes);
  app.use('/api/subscriptions', subscriptionsRoutes);
  app.use('/api/comments', commentsRoutes);

  app.use(errorHandler);

  return app;
}
