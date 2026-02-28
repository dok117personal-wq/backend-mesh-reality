import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { commentService } from '../services/comment.service.js';
import { success } from '../types/api.js';
import { Errors } from '../errors/AppError.js';

const createBody = z.object({ content: z.string().min(1) });
const updateBody = z.object({ content: z.string().min(1) });

export const commentsRoutes = Router();

commentsRoutes.use(authMiddleware);

commentsRoutes.get('/model/:modelId', async (req, res, next) => {
  try {
    const comments = await commentService.listByModelId(req.params.modelId);
    res.json(success(comments));
  } catch (e) {
    next(e);
  }
});

commentsRoutes.post('/model/:modelId', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const body = createBody.parse(req.body);
    const comment = await commentService.create(req.params.modelId, req.user.id, body.content);
    res.status(201).json(success(comment));
  } catch (e) {
    next(e);
  }
});

commentsRoutes.put('/:id', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    const body = updateBody.parse(req.body);
    const comment = await commentService.update(req.params.id, req.user.id, body.content);
    res.json(success(comment));
  } catch (e) {
    next(e);
  }
});

commentsRoutes.delete('/:id', async (req, res, next) => {
  try {
    if (!req.user?.id) throw Errors.unauthorized();
    await commentService.delete(req.params.id, req.user.id);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
