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

export const corsMiddleware = cors({
  origin: (origin, cb) => {
    if (!origin || allowed.has(origin) || isVercelOrigin(origin)) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  exposedHeaders: ['Content-Disposition'],
});
