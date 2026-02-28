import { prisma } from '../lib/prisma.js';
import { Errors } from '../errors/AppError.js';

export const userService = {
  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { Subscription: true },
    });
    if (!user) throw Errors.notFound('User not found');
    return user;
  },

  async updateMe(userId: string, data: { displayName?: string }) {
    const updateData: { displayName?: string; updatedAt: Date } = { updatedAt: new Date() };
    if (data.displayName !== undefined) updateData.displayName = data.displayName;

    return prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: { Subscription: true },
    });
  },
};
