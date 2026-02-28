import { prisma } from '../lib/prisma.js';
import { Errors } from '../errors/AppError.js';

const userSelect = { id: true, displayName: true, photoUrl: true };

export const commentService = {
  async listByModelId(modelId: string) {
    return prisma.comment.findMany({
      where: { modelId },
      orderBy: { createdAt: 'desc' },
      include: { User: { select: userSelect } },
    });
  },

  async create(modelId: string, userId: string, content: string) {
    const model = await prisma.model.findUnique({ where: { id: modelId } });
    if (!model) throw Errors.notFound('Model not found');
    if (!model.isPublic && model.user_id !== userId) throw Errors.forbidden('Access denied');

    return prisma.comment.create({
      data: {
        id: `comment_${Date.now()}`,
        content,
        userId,
        modelId,
        updatedAt: new Date(),
      },
      include: { User: { select: userSelect } },
    });
  },

  async update(commentId: string, userId: string, content: string) {
    const existing = await prisma.comment.findFirst({ where: { id: commentId, userId } });
    if (!existing) throw Errors.notFound('Comment not found');

    return prisma.comment.update({
      where: { id: commentId },
      data: { content, updatedAt: new Date() },
      include: { User: { select: userSelect } },
    });
  },

  async delete(commentId: string, userId: string) {
    const existing = await prisma.comment.findFirst({ where: { id: commentId, userId } });
    if (!existing) throw Errors.notFound('Comment not found');
    await prisma.comment.delete({ where: { id: commentId } });
  },
};
