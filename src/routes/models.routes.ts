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
import { env } from '../config/env.js';

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

/** Export formats supported by pipeline (Swift outputs usdz/obj/stl; more can be added when converter supports them). */
export const SUPPORTED_EXPORT_FORMATS = ['usdz', 'obj', 'stl', 'glb'] as const;
export type ExportFormat = (typeof SUPPORTED_EXPORT_FORMATS)[number];

export const modelsRoutes = Router();

/** Public: get shared model by id (no auth). */
modelsRoutes.get('/public/:id', async (req, res, next) => {
  try {
    const model = await modelService.getByIdPublic(req.params.id);
    res.json(success(model));
  } catch (e) {
    next(e);
  }
});

/** Public: download shared model by format (no auth). */
modelsRoutes.get('/public/:id/download', async (req, res, next) => {
  try {
    const model = await modelService.getByIdPublic(req.params.id);
    if (!model) throw Errors.notFound('Model not found');
    const format = (req.query.format as string)?.toLowerCase() || 'usdz';
    const urls = (model.outputUrls ?? {}) as Record<string, string>;
    const url = urls[format] || urls.usdz || Object.values(urls)[0];
    if (!url || typeof url !== 'string') {
      throw Errors.notFound('No download URL for this format. Available: ' + Object.keys(urls).join(', ') || 'none');
    }
    const fileRes = await fetch(url);
    if (!fileRes.ok) throw Errors.notFound('File not available from storage');
    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
    if (contentType.includes('application/json')) {
      throw Errors.notFound('Storage URL returns JSON – check R2 public URL config');
    }
    const ext = format === 'usdz' ? 'usdz' : format;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(model.title || 'model')}.${ext}"`);
    if (!fileRes.body) throw Errors.notFound('Empty response from storage');
    Readable.fromWeb(fileRes.body as import('stream/web').ReadableStream).pipe(res);
  } catch (e) {
    next(e);
  }
});

modelsRoutes.use(authMiddleware);

modelsRoutes.get('/', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const userEmail = (req.user as { email?: string }).email;
    const result = await modelService.listForUser(req.user.id, userEmail);
    res.json(success(result));
  } catch (e) {
    next(e);
  }
});

const dismissShareBody = z.object({ modelId: z.string().min(1) });

/** Recipient removes a shared model from their list (dismiss). Does not delete the model or revoke the share. */
modelsRoutes.post('/shared/dismiss', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const userEmail = (req.user as { email?: string }).email;
    if (!userEmail) throw Errors.forbidden('Account has no email');
    const body = dismissShareBody.parse(req.body);
    await modelService.dismissShare(body.modelId, userEmail);
    return res.json(success({ dismissed: true }));
  } catch (e) {
    return next(e);
  }
});

/** Restricted share: get model by token (only if current user's email matches share). */
modelsRoutes.get('/shared/s/:token', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const userEmail = (req.user as { email?: string }).email;
    if (!userEmail) throw Errors.forbidden('Account has no email; cannot use restricted share link');
    const model = await modelService.getByShareToken(req.params.token, userEmail);
    res.json(success(model));
  } catch (e) {
    next(e);
  }
});

/** Restricted share: download by token (auth + email match required). */
modelsRoutes.get('/shared/s/:token/download', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const userEmail = (req.user as { email?: string }).email;
    if (!userEmail) throw Errors.forbidden('Account has no email');
    const model = await modelService.getByShareToken(req.params.token, userEmail);
    if (!model) throw Errors.notFound('Model not found');
    const format = (req.query.format as string)?.toLowerCase() || 'usdz';
    const urls = (model.outputUrls ?? {}) as Record<string, string>;
    const url = urls[format] ?? urls.usdz ?? Object.values(urls)[0];
    if (!url || typeof url !== 'string') {
      throw Errors.notFound('No download URL for this format. Available: ' + Object.keys(urls).join(', ') || 'none');
    }
    const fileRes = await fetch(url);
    if (!fileRes.ok) throw Errors.notFound('File not available from storage');
    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
    if (contentType.includes('application/json')) {
      throw Errors.notFound('Storage URL returns JSON – check R2 public URL config');
    }
    const ext = format === 'usdz' ? 'usdz' : format;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(model.title || 'model')}.${ext}"`);
    if (!fileRes.body) throw Errors.notFound('Empty response from storage');
    Readable.fromWeb(fileRes.body as import('stream/web').ReadableStream).pipe(res);
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

/** List people the model is shared with (restricted shares). Owner only. */
modelsRoutes.get('/:id/shares', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const shares = await modelService.listSharesForModel(req.params.id, req.user.id);
    const baseUrl = env.frontendUrl.replace(/\/$/, '');
    const list = shares.map((s: { email: string; token: string; createdAt: Date }) => ({
      email: s.email,
      shareUrl: `${baseUrl}/share/s/${s.token}`,
      createdAt: s.createdAt,
    }));
    res.json(success({ shares: list }));
  } catch (e) {
    next(e);
  }
});

const revokeShareBody = z.object({ email: z.string().email() });

/** Revoke restricted share for one email. Owner only. */
modelsRoutes.post('/:id/shares/revoke', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const body = revokeShareBody.parse(req.body);
    await modelService.revokeShare(req.params.id, req.user.id, body.email);
    return res.json(success({ revoked: true }));
  } catch (e) {
    return next(e);
  }
});

modelsRoutes.get('/:id', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const userEmail = (req.user as { email?: string }).email;
    const model = await modelService.getById(req.params.id, req.user.id, userEmail);
    res.json(success(model));
  } catch (e) {
    next(e);
  }
});

modelsRoutes.get('/:id/download', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const userEmail = (req.user as { email?: string }).email;
    const model = await modelService.getById(req.params.id, req.user.id, userEmail);
    if (!model) throw Errors.notFound('Model not found');
    const urls = (model.outputUrls ?? {}) as Record<string, string>;
    const format = (req.query.format as string)?.toLowerCase() || 'usdz';
    const url = urls[format] ?? urls.usdz ?? Object.values(urls)[0];
    if (!url || typeof url !== 'string') {
      throw Errors.notFound('No download URL for this format. Available: ' + (Object.keys(urls).length ? Object.keys(urls).join(', ') : 'none'));
    }
    const fileRes = await fetch(url);
    if (!fileRes.ok) throw Errors.notFound('File not available from storage');
    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
    if (contentType.includes('application/json')) {
      throw Errors.notFound('Storage URL returns JSON - set CLOUDFLARE_R2_PUBLIC_URL to R2 public bucket URL');
    }
    const ext = format === 'usdz' ? 'usdz' : format;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(model.title || 'model')}.${ext}"`);
    if (!fileRes.body) throw Errors.notFound('Empty response from storage');
    Readable.fromWeb(fileRes.body as import('stream/web').ReadableStream).pipe(res);
  } catch (e) {
    next(e);
  }
});

const shareBody = z.object({
  type: z.enum(['public', 'restricted']),
  emails: z.array(z.string().email()).optional(),
});

modelsRoutes.post('/:id/share', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const body = shareBody.parse(req.body);
    const baseUrl = env.frontendUrl.replace(/\/$/, '');
    if (body.type === 'public') {
      const model = await modelService.setPublic(req.params.id, req.user.id);
      if (!model) throw Errors.notFound('Model not found');
      const shareUrl = `${baseUrl}/share/${model.id}`;
      return res.json(success({ shareUrl, isPublic: true }));
    }
    const result = await modelService.createShare(req.params.id, req.user.id, {
      type: 'restricted',
      emails: body.emails ?? [],
    });
    const shareUrls = (result.shareUrls ?? []).map(({ email, token }) => ({
      email,
      shareUrl: `${baseUrl}/share/s/${token}`,
    }));
    return res.json(success({ shareUrls, isPublic: false }));
  } catch (e) {
    return next(e);
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
