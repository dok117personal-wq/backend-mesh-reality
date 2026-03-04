import { prisma } from '../lib/prisma.js';
import { Errors } from '../errors/AppError.js';

const modelInclude = {
  User: { select: { id: true, displayName: true, photoUrl: true } },
  jobs: true,
};

type ModelWithRelations = Awaited<ReturnType<typeof prisma.model.findFirst>> & {
  User: { id: string; displayName: string | null; photoUrl: string | null };
  jobs: Array<{ id: string; status: string; error_message: string | null; output_formats: unknown; output_urls: unknown; created_at: Date | null; updated_at: Date | null; model_id: string | null }>;
};

function toApiModel(model: ModelWithRelations | null) {
  if (!model) return null;
  return {
    id: model.id,
    userId: model.user_id,
    user: model.User ? { id: model.User.id, displayName: model.User.displayName, photoUrl: model.User.photoUrl } : undefined,
    title: model.title,
    description: model.description,
    filePath: model.filePath,
    fileType: model.fileType,
    previewUrl: model.preview_url,
    outputUrls: model.output_urls,
    status: model.status,
    isPublic: model.isPublic,
    createdAt: model.created_at,
    updatedAt: model.updated_at,
    jobs: model.jobs?.map((j) => ({
      id: j.id,
      status: j.status,
      errorMessage: j.error_message,
      outputFormats: j.output_formats,
      outputUrls: j.output_urls,
      outputUrl: (j as { output_url?: string }).output_url,
      createdAt: j.created_at,
      updatedAt: j.updated_at,
      modelId: j.model_id,
    })),
  };
}

export const modelService = {
  async listForUser(userId: string) {
    const models = await prisma.model.findMany({
      where: { OR: [{ user_id: userId }, { isPublic: true }] },
      orderBy: { created_at: 'desc' },
      include: modelInclude,
    });
    return { models: models.map((m) => toApiModel(m as ModelWithRelations)), total: models.length };
  },

  async listCommunity() {
    const models = await prisma.model.findMany({
      where: { isPublic: true },
      orderBy: { created_at: 'desc' },
      include: modelInclude,
    });
    return { models: models.map((m) => toApiModel(m as ModelWithRelations)), total: models.length };
  },

  async getById(id: string, userId: string) {
    const model = await prisma.model.findUnique({
      where: { id },
      include: modelInclude,
    });
    if (!model) throw Errors.notFound('Model not found');
    if (!model.isPublic && model.user_id !== userId) throw Errors.forbidden('Access denied');
    return toApiModel(model as ModelWithRelations);
  },

  /** Public access: return model metadata + outputUrls for shared (isPublic) models. No auth. */
  async getByIdPublic(id: string) {
    const model = await prisma.model.findUnique({
      where: { id },
      include: modelInclude,
    });
    if (!model) throw Errors.notFound('Model not found');
    if (!model.isPublic) throw Errors.forbidden('Model is not shared');
    return toApiModel(model as ModelWithRelations);
  },

  async listByUser(userId: string, currentUserId: string) {
    const models = await prisma.model.findMany({
      where: {
        user_id: userId,
        OR: [{ user_id: currentUserId }, { isPublic: true }],
      },
      orderBy: { created_at: 'desc' },
      include: modelInclude,
    });
    return { models: models.map((m) => toApiModel(m as ModelWithRelations)), total: models.length };
  },

  async create(userId: string, data: { title?: string; description?: string }) {
    const now = new Date();
    const model = await prisma.model.create({
      data: {
        id: `model_${Date.now()}`,
        title: data.title ?? '',
        description: data.description ?? undefined,
        isPublic: false,
        user_id: userId,
        status: 'pending',
        filePath: '',
        fileType: 'usdz',
        created_at: now,
        updated_at: now,
      },
      include: modelInclude,
    });
    return toApiModel(model as ModelWithRelations);
  },

  async update(id: string, userId: string, data: { title?: string; description?: string; isPublic?: boolean }) {
    const existing = await prisma.model.findFirst({ where: { id, user_id: userId } });
    if (!existing) throw Errors.notFound('Model not found');

    const updated = await prisma.model.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
        updated_at: new Date(),
      },
      include: modelInclude,
    });
    return toApiModel(updated as ModelWithRelations);
  },

  async delete(id: string, userId: string) {
    const existing = await prisma.model.findFirst({ where: { id, user_id: userId } });
    if (!existing) throw Errors.notFound('Model not found');
    await prisma.model.delete({ where: { id } });
  },
};
