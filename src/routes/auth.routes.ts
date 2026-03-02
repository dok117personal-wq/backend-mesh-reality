import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { authService } from '../services/auth.service.js';
import { userService } from '../services/user.service.js';
import { success } from '../types/api.js';
import { Errors } from '../errors/AppError.js';
import { env } from '../config/env.js';

/** Session cookie: persist in browser until logout or expiry (1 year). Same browser = stay logged in. */
const SESSION_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year
const COOKIE_OPTS = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'lax' as const,
  maxAge: SESSION_MAX_AGE_MS,
  path: '/',
};

const loginBody = z.object({
  access_token: z.string().optional(),
  token: z.string().optional(),
}).refine((d) => d.access_token ?? d.token, { message: 'access_token or token required' });

const updateMeBody = z.object({
  displayName: z.string().optional(),
});

export const authRoutes = Router();

authRoutes.post('/login', async (req, res, next) => {
  try {
    const parsed = loginBody.safeParse(req.body);
    const token = parsed.success ? (parsed.data.access_token ?? parsed.data.token) : undefined;
    if (!token) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error?.message ?? 'access_token or token required' } });
    }
    const user = await authService.login(token);
    res.cookie(env.sessionCookieName, token, COOKIE_OPTS);
    res.json(success(user));
  } catch (e) {
    next(e);
  }
});

authRoutes.get('/session', async (req, res, next) => {
  try {
    const token = req.cookies?.[env.sessionCookieName];
    if (!token) return res.status(401).json({ error: { code: 'NO_TOKEN', message: 'No session' } });
    const user = await authService.login(token);
    res.json(success(user));
  } catch (e) {
    next(e);
  }
});

authRoutes.post('/logout', (_req, res, next) => {
  try {
    res.clearCookie(env.sessionCookieName, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 0,
      secure: env.nodeEnv === 'production',
    });
    res.json(success(null));
  } catch (e) {
    next(e);
  }
});

authRoutes.get('/oauth', (req, res, next) => {
  try {
    const provider = (req.query.provider as string)?.toLowerCase();
    if (provider !== 'google' && provider !== 'apple') {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'provider must be google or apple' } });
    }
    const supabaseUrl = env.supabase.url?.replace(/\/$/, '');
    if (!supabaseUrl) return res.status(503).json({ error: { code: 'CONFIG', message: 'OAuth not configured' } });
    const redirectTo = `${env.frontendUrl.replace(/\/$/, '')}/auth/callback`;
    const authUrl = `${supabaseUrl}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}`;
    res.redirect(302, authUrl);
  } catch (e) {
    next(e);
  }
});

const phoneRequestBody = z.object({ phone: z.string().min(10) });
const phoneVerifyBody = z.object({ phone: z.string().min(10), token: z.string().length(6) });

authRoutes.post('/phone/request', async (req, res, next) => {
  try {
    const parsed = phoneRequestBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', message: 'phone required' } });
    const supabaseUrl = env.supabase.url?.replace(/\/$/, '');
    const anonKey = env.supabase.anonKey;
    if (!supabaseUrl || !anonKey) return res.status(503).json({ error: { code: 'CONFIG', message: 'Phone auth not configured' } });
    const r = await fetch(`${supabaseUrl}/auth/v1/otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ phone: parsed.data.phone }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: { code: 'OTP_FAILED', message: data?.msg ?? data?.error_description ?? 'Failed to send code' } });
    res.json(success({ sent: true }));
  } catch (e) {
    next(e);
  }
});

authRoutes.post('/phone/verify', async (req, res, next) => {
  try {
    const parsed = phoneVerifyBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', message: 'phone and token required' } });
    const supabaseUrl = env.supabase.url?.replace(/\/$/, '');
    const anonKey = env.supabase.anonKey;
    if (!supabaseUrl || !anonKey) return res.status(503).json({ error: { code: 'CONFIG', message: 'Phone auth not configured' } });
    const r = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ phone: parsed.data.phone, token: parsed.data.token, type: 'sms' }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: { code: 'VERIFY_FAILED', message: data?.msg ?? data?.error_description ?? 'Invalid code' } });
    const accessToken = data?.access_token;
    if (!accessToken) return res.status(401).json({ error: { code: 'NO_TOKEN', message: 'No session' } });
    const user = await authService.login(accessToken);
    res.cookie(env.sessionCookieName, accessToken, COOKIE_OPTS);
    res.json(success({ user, token: accessToken }));
  } catch (e) {
    next(e);
  }
});

authRoutes.get('/me', authMiddleware, async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const user = await userService.getMe(req.user.id);
    res.json(success(user));
  } catch (e) {
    next(e);
  }
});

authRoutes.put('/me', authMiddleware, async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const body = updateMeBody.safeParse(req.body);
    const data = body.success ? body.data : {};
    const user = await userService.updateMe(req.user.id, data);
    res.json(success(user));
  } catch (e) {
    next(e);
  }
});
