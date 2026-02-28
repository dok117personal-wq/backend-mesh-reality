import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { requireSubscription } from '../middleware/subscription.js';
import { modelService } from '../services/model.service.js';
import { jobService } from '../services/job.service.js';
import { success } from '../types/api.js';
import { Errors } from '../errors/AppError.js';

const createModelBody = z.object({ title: z.string().optional(), description: z.string().optional() });
const updateModelBody = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  isPublic: z.boolean().optional(),
});
const generateBody = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  generationType: z.enum(['text', 'image', 'images']),
  textPrompt: z.string().optional(),
  imageData: z.unknown().optional(),
  imageDataArray: z.array(z.string()).optional(),
  options: z.record(z.unknown()).optional(),
});

export const modelsRoutes = Router();

modelsRoutes.use(authMiddleware);

modelsRoutes.get('/', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const result = await modelService.listForUser(req.user.id);
    res.json(success(result));
  } catch (e) {
    next(e);
  }
});

modelsRoutes.get('/community', async (req, res, next) => {
  try {
    const result = await modelService.listCommunity();
    res.json(success(result));
  } catch (e) {
    next(e);
  }
});

modelsRoutes.get('/user/:userId', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const result = await modelService.listByUser(req.params.userId, req.user.id);
    res.json(success(result));
  } catch (e) {
    next(e);
  }
});

modelsRoutes.get('/jobs/:jobId', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const job = await jobService.getJobStatus(req.params.jobId, req.user.id);
    res.json(success(job));
  } catch (e) {
    next(e);
  }
});

modelsRoutes.get('/:id', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const model = await modelService.getById(req.params.id, req.user.id);
    res.json(success(model));
  } catch (e) {
    next(e);
  }
});

modelsRoutes.get('/:id/download', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const model = await modelService.getById(req.params.id, req.user.id);
    const urls = (model.outputUrls ?? {}) as Record<string, string>;
    const usdzUrl = urls.usdz ?? Object.values(urls)[0];
    if (!usdzUrl || typeof usdzUrl !== 'string') {
      throw Errors.notFound('No download URL available');
    }
    // Proxy the file to avoid CORS when R2 is on different origin
    const fileRes = await fetch(usdzUrl);
    if (!fileRes.ok) {
      throw Errors.notFound('File not available from storage');
    }
    const contentType = fileRes.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      throw Errors.notFound('Storage URL returns JSON - set CLOUDFLARE_R2_PUBLIC_URL to R2 public bucket URL (e.g. https://pub-xxx.r2.dev), not the S3 API endpoint');
    }
    res.setHeader('Content-Type', contentType || 'model/vnd.usdz+zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(model.title || 'model')}.usdz"`);
    fileRes.body?.pipe(res);
  } catch (e) {
    next(e);
  }
});

modelsRoutes.post('/', requireSubscription, async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const body = createModelBody.parse(req.body);
    const model = await modelService.create(req.user.id, body);
    res.status(201).json(success(model));
  } catch (e) {
    next(e);
  }
});

modelsRoutes.put('/:id', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const body = updateModelBody.parse(req.body);
    const model = await modelService.update(req.params.id, req.user.id, body);
    res.json(success(model));
  } catch (e) {
    next(e);
  }
});

modelsRoutes.delete('/:id', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    await modelService.delete(req.params.id, req.user.id);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

modelsRoutes.post('/generate', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const body = generateBody.parse(req.body);
    console.log('[generate] userId=%s generationType=%s imageCount=%s', req.user.id, body.generationType, body.imageDataArray?.length ?? 0);
    const result = await jobService.createGenerationJob(req.user.id, {
      ...body,
      generationType: body.generationType,
    });
    console.log('[generate] job created jobId=%s', result.jobId);
    res.status(201).json(success(result));
  } catch (e) {
    console.error('POST /api/models/generate failed:', e);
    next(e);
  }
});
