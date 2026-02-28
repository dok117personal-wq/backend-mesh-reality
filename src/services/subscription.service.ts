import { prisma } from '../lib/prisma.js';
import { Errors } from '../errors/AppError.js';

const PLAN_LIMITS: Record<string, { modelLimit: number; storageLimit: bigint }> = {
  free: { modelLimit: 10, storageLimit: BigInt(1024 * 1024 * 1024) },
  pro: { modelLimit: 50, storageLimit: BigInt(5 * 1024 * 1024 * 1024) },
  enterprise: { modelLimit: 100, storageLimit: BigInt(20 * 1024 * 1024 * 1024) },
};

const DEFAULT_LIMITS = PLAN_LIMITS.free;

export const subscriptionService = {
  async getByUserId(userId: string) {
    return prisma.subscription.findUnique({ where: { userId } });
  },

  async createOrUpdate(userId: string, data: { planType: string; autoRenew?: boolean }) {
    const limits = PLAN_LIMITS[data.planType] ?? DEFAULT_LIMITS;
    const now = new Date();

    return prisma.subscription.upsert({
      where: { userId },
      update: {
        planType: data.planType,
        status: 'active',
        startDate: now,
        endDate: null,
        modelLimit: limits.modelLimit,
        storageLimit: limits.storageLimit,
        autoRenew: data.autoRenew ?? false,
        updatedAt: now,
      },
      create: {
        id: `sub_${Date.now()}`,
        userId,
        planType: data.planType,
        status: 'active',
        startDate: now,
        endDate: null,
        modelLimit: limits.modelLimit,
        storageLimit: limits.storageLimit,
        autoRenew: data.autoRenew ?? false,
        updatedAt: now,
      },
    });
  },

  async updateUsage(userId: string, data: { modelsCreated?: number; storageUsed?: number }) {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub) throw Errors.notFound('Subscription not found');

    return prisma.subscription.update({
      where: { userId },
      data: {
        ...(data.modelsCreated !== undefined && { modelsCreated: data.modelsCreated }),
        ...(data.storageUsed !== undefined && { storageUsed: BigInt(data.storageUsed) }),
        updatedAt: new Date(),
      },
    });
  },

  async cancel(userId: string) {
    return prisma.subscription.update({
      where: { userId },
      data: {
        status: 'cancelled',
        endDate: new Date(),
        autoRenew: false,
        updatedAt: new Date(),
      },
    });
  },
};
