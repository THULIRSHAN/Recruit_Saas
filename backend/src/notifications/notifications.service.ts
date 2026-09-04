import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Notification, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListMyNotificationsQueryDto } from './dto/list-my-notifications-query.dto';

const NOTIFICATION_NOT_FOUND_MESSAGE = 'Notification not found.';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // REQ-NOTIF-001/Q28: called directly by the originating service after
  // its own transaction commits (CLAUDE.md rule 4's "emitted events" read
  // as this conceptual pattern, not a literal pub-sub layer -- see Q28;
  // matches the direct-write precedent already established for AuditLog).
  // "Email" is a stub, logged not sent, same as Q12's verification/reset
  // emails -- no provider has been chosen yet.
  async notify(userId: string, type: string, payload: Prisma.InputJsonValue) {
    await this.prisma.notification.create({
      data: { userId, type, payload },
    });
    this.logger.log(
      `Notification [${type}] for user ${userId}: ${JSON.stringify(payload)}`,
    );
  }

  async listMine(userId: string, query: ListMyNotificationsQueryDto) {
    const where = { userId };
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: data.map((notification) => this.toDetail(notification)),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) {
      throw new NotFoundException(NOTIFICATION_NOT_FOUND_MESSAGE);
    }

    const updated = await this.prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: notification.readAt ?? new Date() },
    });
    return this.toDetail(updated);
  }

  private toDetail(notification: Notification) {
    return {
      id: notification.id,
      type: notification.type,
      payload: notification.payload,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    };
  }
}
