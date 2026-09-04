import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

function createPrismaMock() {
  const notification = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  const prisma = { notification };
  return { prisma: prisma as unknown as PrismaService, notification };
}

const baseNotification = {
  id: 'notif-1',
  userId: 'user-1',
  type: 'application.rejected',
  payload: { applicationId: 'app-1' },
  readAt: null,
  createdAt: new Date('2026-01-01'),
};

describe('NotificationsService', () => {
  describe('notify', () => {
    it('creates a Notification row', async () => {
      const { prisma, notification } = createPrismaMock();
      const service = new NotificationsService(prisma);

      await service.notify('user-1', 'application.rejected', {
        applicationId: 'app-1',
      });

      expect(notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: 'application.rejected',
          payload: { applicationId: 'app-1' },
        },
      });
    });
  });

  describe('listMine', () => {
    it('scopes results to the caller with pagination', async () => {
      const { prisma, notification } = createPrismaMock();
      notification.findMany.mockResolvedValue([baseNotification]);
      notification.count.mockResolvedValue(1);
      const service = new NotificationsService(prisma);

      const result = await service.listMine('user-1', {
        page: 1,
        pageSize: 20,
      });

      expect(notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(result.data[0].id).toBe('notif-1');
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });
  });

  describe('markRead', () => {
    it("sets readAt on the caller's own notification", async () => {
      const { prisma, notification } = createPrismaMock();
      notification.findFirst.mockResolvedValue(baseNotification);
      notification.update.mockResolvedValue({
        ...baseNotification,
        readAt: new Date('2026-01-02'),
      });
      const service = new NotificationsService(prisma);

      const result = await service.markRead('user-1', 'notif-1');

      expect(notification.findFirst).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'user-1' },
      });
      expect(notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'notif-1' },
          data: expect.objectContaining({
            readAt: expect.any(Date) as Date,
          }) as unknown,
        }),
      );
      expect(result.readAt).not.toBeNull();
    });

    it('is idempotent -- marking an already-read notification keeps the original readAt', async () => {
      const { prisma, notification } = createPrismaMock();
      const readAt = new Date('2026-01-02');
      notification.findFirst.mockResolvedValue({
        ...baseNotification,
        readAt,
      });
      notification.update.mockResolvedValue({ ...baseNotification, readAt });
      const service = new NotificationsService(prisma);

      await service.markRead('user-1', 'notif-1');

      expect(notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { readAt },
        }),
      );
    });

    it("throws NotFoundException for another user's notification", async () => {
      const { prisma, notification } = createPrismaMock();
      notification.findFirst.mockResolvedValue(null);
      const service = new NotificationsService(prisma);

      await expect(
        service.markRead('user-1', 'notif-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(notification.update).not.toHaveBeenCalled();
    });
  });
});
