import 'dotenv/config';

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '3002')),
  isVercel: process.env.VERCEL === '1',

  supabase: {
    url: optional('SUPABASE_URL', ''),
    serviceRoleKey: optional('SUPABASE_SERVICE_ROLE_KEY', ''),
    anonKey: optional('SUPABASE_ANON_KEY', ''),
  },

  database: {
    url: required('DATABASE_URL'),
  },

  cors: {
    origins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim().replace(/\/$/, '')),
    allowVercel: true,
  },

  frontendUrl: optional('FRONTEND_URL', 'http://localhost:3000'),
  sessionCookieName: optional('SESSION_COOKIE_NAME', 'session'),

  /** Swift Photogrammetry API (multi-photo → 3D). Used when generationType is "images". */
  swiftApiUrl: optional('SWIFT_API_URL', 'http://127.0.0.1:8080'),
} as const;
