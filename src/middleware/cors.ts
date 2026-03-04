import cors from 'cors';
import { env } from '../config/env.js';

const allowed = new Set(env.cors.origins);

function isVercelOrigin(origin: string): boolean {
  return env.cors.allowVercel && (
    origin.endsWith('.vercel.app') ||
    origin.includes('-git-') ||
    origin.includes('.vercel.app')
  );
}

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, '');
  return allowed.has(normalized) || allowed.has(origin) || isVercelOrigin(origin);
}

export const corsMiddleware = cors({
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin ?? '')) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  exposedHeaders: ['Content-Disposition'],
});
