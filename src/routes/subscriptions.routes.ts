import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { subscriptionService } from '../services/subscription.service.js';
import { success } from '../types/api.js';
import { Errors } from '../errors/AppError.js';

const createBody = z.object({
  planType: z.string().min(1),
  autoRenew: z.boolean().optional(),
});
const usageBody = z.object({
  modelsCreated: z.number().optional(),
  storageUsed: z.number().optional(),
});

export const subscriptionsRoutes = Router();

subscriptionsRoutes.use(authMiddleware);

subscriptionsRoutes.get('/me', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const sub = await subscriptionService.getByUserId(req.user.id);
    res.json(success(sub));
  } catch (e) {
    next(e);
  }
});

subscriptionsRoutes.post('/', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const body = createBody.parse(req.body);
    const existing = await subscriptionService.getByUserId(req.user.id);
    if (existing) return res.status(400).json({ error: { code: 'ALREADY_EXISTS', message: 'User already has a subscription' } });
    const sub = await subscriptionService.createOrUpdate(req.user.id, body);
    res.status(201).json(success(sub));
  } catch (e) {
    next(e);
  }
});

subscriptionsRoutes.put('/usage', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const body = usageBody.parse(req.body);
    const sub = await subscriptionService.updateUsage(req.user.id, body);
    res.json(success(sub));
  } catch (e) {
    next(e);
  }
});

subscriptionsRoutes.post('/cancel', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const sub = await subscriptionService.cancel(req.user.id);
    res.json(success(sub));
  } catch (e) {
    next(e);
  }
});
