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

function randomToken(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export const modelService = {
  /** My models + models shared with me (by email). Excludes shares the recipient has dismissed. */
  async listForUser(userId: string, userEmail?: string | null) {
    const or: Array<{ user_id: string } | { ModelShare: { some: { email: string; dismissed_at: null } } }> = [{ user_id: userId }];
    if (userEmail?.trim()) {
      or.push({ ModelShare: { some: { email: userEmail.trim().toLowerCase(), dismissed_at: null } } });
    }
    const models = await prisma.model.findMany({
      where: { OR: or },
      orderBy: { created_at: 'desc' },
      include: modelInclude,
    });
    return {
      models: models.map((m) => {
        const out = toApiModel(m as unknown as ModelWithRelations);
        return out ? { ...out, sharedWithMe: m.user_id !== userId } : out;
      }),
      total: models.length,
    };
  },

  async listCommunity() {
    const models = await prisma.model.findMany({
      where: { isPublic: true },
      orderBy: { created_at: 'desc' },
      include: modelInclude,
    });
    return { models: models.map((m) => toApiModel(m as unknown as ModelWithRelations)), total: models.length };
  },

  async getById(id: string, userId: string, userEmail?: string | null) {
    const model = await prisma.model.findUnique({
      where: { id },
      include: { ...modelInclude, ModelShare: true },
    });
    if (!model) throw Errors.notFound('Model not found');
    if (model.user_id === userId) return toApiModel(model as unknown as ModelWithRelations);
    if (model.isPublic) return toApiModel(model as unknown as ModelWithRelations);
    const email = userEmail?.trim().toLowerCase();
    if (email && model.ModelShare?.some((s) => s.email === email)) {
      return toApiModel(model as unknown as ModelWithRelations);
    }
    throw Errors.forbidden('Access denied');
  },

  /** Public access: return model metadata + outputUrls for shared (isPublic) models. No auth. */
  async getByIdPublic(id: string) {
    const model = await prisma.model.findUnique({
      where: { id },
      include: modelInclude,
    });
    if (!model) throw Errors.notFound('Model not found');
    if (!model.isPublic) throw Errors.forbidden('Model is not shared');
    return toApiModel(model as unknown as ModelWithRelations);
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
    return { models: models.map((m) => toApiModel(m as unknown as ModelWithRelations)), total: models.length };
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
    return toApiModel(model as unknown as ModelWithRelations);
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
    return toApiModel(updated as unknown as ModelWithRelations);
  },

  /** Share: set model to public so GET /public/:id works. Returns updated model. */
  async setPublic(id: string, userId: string) {
    const existing = await prisma.model.findFirst({ where: { id, user_id: userId } });
    if (!existing) throw Errors.notFound('Model not found');
    const updated = await prisma.model.update({
      where: { id },
      data: { isPublic: true, updated_at: new Date() },
      include: modelInclude,
    });
    return toApiModel(updated as unknown as ModelWithRelations);
  },

  /**
   * Create share: public link (anyone with link) or restricted (specific people by email).
   * Returns shareUrl(s) for the frontend to copy/send.
   */
  async createShare(
    modelId: string,
    userId: string,
    options: { type: 'public' | 'restricted'; emails?: string[] }
  ): Promise<{ shareUrl?: string; isPublic?: boolean; shareUrls?: Array<{ email: string; token: string }> }> {
    const model = await prisma.model.findFirst({ where: { id: modelId, user_id: userId } });
    if (!model) throw Errors.notFound('Model not found');

    if (options.type === 'public') {
      await prisma.model.update({
        where: { id: modelId },
        data: { isPublic: true, updated_at: new Date() },
      });
      return { isPublic: true };
    }

    const emails = (options.emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (emails.length === 0) throw Errors.badRequest('At least one email required for restricted sharing');

    const shareUrls: Array<{ email: string; token: string }> = [];
    for (const email of emails) {
      const token = randomToken();
      const shareId = `share_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      await prisma.modelShare.create({
        data: {
          id: shareId,
          model_id: modelId,
          email,
          token,
        },
      });
      shareUrls.push({ email, token });
    }
    return { shareUrls };
  },

  /** Revoke restricted share for one email. Owner only. */
  async revokeShare(modelId: string, userId: string, email: string) {
    const model = await prisma.model.findFirst({ where: { id: modelId, user_id: userId } });
    if (!model) throw Errors.notFound('Model not found');
    const normalized = email.trim().toLowerCase();
    const deleted = await prisma.modelShare.deleteMany({
      where: { model_id: modelId, email: normalized },
    });
    if (deleted.count === 0) throw Errors.notFound('No share found for this email');
  },

  /** List people with access (restricted shares) for a model. Owner only. Does not include public link state. */
  async listSharesForModel(modelId: string, userId: string) {
    const model = await prisma.model.findFirst({ where: { id: modelId, user_id: userId } });
    if (!model) throw Errors.notFound('Model not found');
    const shares = await prisma.modelShare.findMany({
      where: { model_id: modelId },
      orderBy: { created_at: 'desc' },
    });
    return shares.map((s) => ({
      email: s.email,
      token: s.token,
      createdAt: s.created_at,
    }));
  },

  /** Recipient dismisses a shared model from their list (remove from "Shared with you"). Does not delete the share. */
  async dismissShare(modelId: string, userEmail: string) {
    const email = userEmail.trim().toLowerCase();
    const share = await prisma.modelShare.findFirst({
      where: { model_id: modelId, email },
    });
    if (!share) throw Errors.notFound('Share not found or not shared with this account');
    await prisma.modelShare.update({
      where: { id: share.id },
      data: { dismissed_at: new Date() },
    });
  },

  /** Get model by restricted share token; caller must ensure share.email === currentUser.email. */
  async getByShareToken(token: string, userEmail: string) {
    const share = await prisma.modelShare.findUnique({
      where: { token },
      include: { Model: { include: modelInclude } },
    });
    if (!share) throw Errors.notFound('Share link not found or expired');
    const email = userEmail?.trim().toLowerCase();
    if (share.email !== email) throw Errors.forbidden('This link was shared with someone else');
    return toApiModel(share.Model as unknown as ModelWithRelations);
  },

  async delete(id: string, userId: string) {
    const existing = await prisma.model.findFirst({ where: { id, user_id: userId } });
    if (!existing) throw Errors.notFound('Model not found');
    await prisma.model.delete({ where: { id } });
  },
};
