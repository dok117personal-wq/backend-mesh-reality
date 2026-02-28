import type { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { prisma } from '../lib/prisma.js';
import { apiError } from '../types/api.js';

export async function requireSubscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user?.id) {
    res.status(401).json(apiError('UNAUTHORIZED', 'Unauthorized'));
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { Subscription: true },
    });

    if (!user) {
      res.status(404).json(apiError('USER_NOT_FOUND', 'User not found'));
      return;
    }

    const sub = user.Subscription;
    if (!sub || sub.status !== 'active') {
      res.status(403).json(apiError('SUBSCRIPTION_REQUIRED', 'Active subscription required'));
      return;
    }

    if (sub.modelsCreated >= sub.modelLimit) {
      res.status(403).json(apiError('MODEL_LIMIT', 'Model limit reached'));
      return;
    }

    if (sub.storageUsed >= sub.storageLimit) {
      res.status(403).json(apiError('STORAGE_LIMIT', 'Storage limit reached'));
      return;
    }

    next();
  } catch (e) {
    console.error('Subscription middleware error:', e);
    res.status(500).json(apiError('INTERNAL', 'Internal server error'));
  }
}
