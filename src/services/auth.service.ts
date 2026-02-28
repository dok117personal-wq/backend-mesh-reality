import { supabase } from '../config/supabase.js';
import { prisma } from '../lib/prisma.js';
import { Errors } from '../errors/AppError.js';

function userFromSupabase(supabaseUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? undefined,
    displayName: (supabaseUser.user_metadata?.full_name ?? supabaseUser.user_metadata?.name) as string | undefined,
    photoUrl: (supabaseUser.user_metadata?.avatar_url ?? supabaseUser.user_metadata?.picture) as string | undefined,
    updatedAt: new Date(),
    Subscription: [],
  };
}

export const authService = {
  async login(accessToken: string) {
    const token = accessToken?.trim();
    if (!token) throw Errors.badRequest('access_token or token is required');

    const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(token);
    if (error || !supabaseUser) throw Errors.unauthorized('Invalid or expired token');

    try {
      let user = await prisma.user.findUnique({
        where: { id: supabaseUser.id },
        include: { Subscription: true },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            id: supabaseUser.id,
            email: supabaseUser.email ?? undefined,
            displayName: (supabaseUser.user_metadata?.full_name ?? supabaseUser.user_metadata?.name) as string | undefined,
            photoUrl: (supabaseUser.user_metadata?.avatar_url ?? supabaseUser.user_metadata?.picture) as string | undefined,
            updatedAt: new Date(),
          },
          include: { Subscription: true },
        });
      }

      return user;
    } catch (e) {
      console.warn('Database unavailable during login, using Supabase user only:', (e as Error).message);
      return userFromSupabase(supabaseUser);
    }
  },
};
