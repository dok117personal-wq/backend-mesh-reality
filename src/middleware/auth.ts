import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { apiError } from '../types/api.js';
import { AppError } from '../errors/AppError.js';

const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const cookieToken = req.cookies?.[env.sessionCookieName];
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const token = cookieToken ?? bearerToken;

    if (!token) {
      res.status(401).json(apiError('NO_TOKEN', 'No token provided'));
      return;
    }

    if (token === 'mock-id-token') {
      const user = await ensureMockUser();
      req.user = { id: user.id, email: user.email, displayName: user.displayName };
      next();
      return;
    }

    const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(token);
    if (error || !supabaseUser) {
      res.status(401).json(apiError('INVALID_TOKEN', 'Invalid or expired token'));
      return;
    }

    try {
      const user = await syncUserFromSupabase(supabaseUser);
      req.user = { id: user.id, email: user.email, displayName: user.displayName };
    } catch (e) {
      console.warn('Database unavailable in auth middleware, using Supabase user only:', (e as Error).message);
      req.user = {
        id: supabaseUser.id,
        email: supabaseUser.email ?? undefined,
        displayName: (supabaseUser.user_metadata?.full_name ?? supabaseUser.user_metadata?.name) as string | undefined,
      };
    }
    next();
  } catch (e) {
    if (e instanceof AppError) {
      res.status(e.statusCode).json(apiError(e.code, e.message));
      return;
    }
    console.error('Auth middleware error:', e);
    res.status(401).json(apiError('AUTH_FAILED', 'Authentication failed'));
  }
}

async function ensureMockUser() {
  let user = await prisma.user.findUnique({ where: { id: MOCK_USER_ID } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: MOCK_USER_ID,
        email: 'test@example.com',
        displayName: 'Test User',
        photoUrl: 'https://via.placeholder.com/150',
        updatedAt: new Date(),
      },
    });
  }
  return user;
}

async function syncUserFromSupabase(supabaseUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
  let user = await prisma.user.findUnique({ where: { id: supabaseUser.id } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: supabaseUser.id,
        email: supabaseUser.email ?? undefined,
        displayName: (supabaseUser.user_metadata?.full_name ?? supabaseUser.user_metadata?.name) as string | undefined,
        photoUrl: (supabaseUser.user_metadata?.avatar_url ?? supabaseUser.user_metadata?.picture) as string | undefined,
        updatedAt: new Date(),
      },
    });
  }
  return user;
}
