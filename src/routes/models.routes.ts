import { Router } from 'express';
import { Readable } from 'stream';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { requireSubscription } from '../middleware/subscription.js';
import { modelService } from '../services/model.service.js';
import { jobService } from '../services/job.service.js';
import { isR2Configured, uploadImagesToR2 } from '../services/r2.service.js';
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
  imageUrls: z.array(z.string().url()).optional(),
  options: z.record(z.unknown()).optional(),
});

const uploadImagesBody = z.object({
  images: z.array(z.string()).min(1).max(100),
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

modelsRoutes.get('/community', async (_req, res, next) => {
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
    if (!model) throw Errors.notFound('Model not found');
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
    const name = model.title || 'model';
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}.usdz"`);
    if (!fileRes.body) {
      throw Errors.notFound('Empty response from storage');
    }
    Readable.fromWeb(fileRes.body as import('stream/web').ReadableStream).pipe(res);
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

modelsRoutes.post('/upload-images', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const body = uploadImagesBody.parse(req.body);
    if (!isR2Configured()) {
      throw Errors.badRequest('R2 upload is not configured. Set CLOUDFLARE_R2_* env vars.');
    }
    const buffers: Buffer[] = [];
    for (let i = 0; i < body.images.length; i++) {
      let base64 = body.images[i];
      if (typeof base64 !== 'string') continue;
      const comma = base64.indexOf(',');
      if (comma !== -1) base64 = base64.slice(comma + 1);
      const buf = Buffer.from(base64, 'base64');
      if (buf.length === 0) throw Errors.badRequest(`Invalid image data at index ${i}`);
      buffers.push(buf);
    }
    if (buffers.length < 3) {
      throw Errors.badRequest('At least 3 images required for photogrammetry.');
    }
    const imageUrls = await uploadImagesToR2(buffers);
    res.status(201).json(success({ imageUrls }));
  } catch (e) {
    next(e);
  }
});

modelsRoutes.post('/generate', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const body = generateBody.parse(req.body);
    const imageCount = body.imageUrls?.length ?? body.imageDataArray?.length ?? 0;
    console.log('[generate] userId=%s generationType=%s imageCount=%s', req.user.id, body.generationType, imageCount);
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
