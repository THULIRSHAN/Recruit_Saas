import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';

function mockResponse(): Response {
  return { status: jest.fn().mockReturnThis() } as unknown as Response;
}

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('returns 200 with an ok status when the database is reachable', async () => {
    const res = mockResponse();
    const result = await controller.check(res);

    expect(result.status).toBe('ok');
    expect(result.database).toBe('ok');
    expect(typeof result.timestamp).toBe('string');
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 503 with an error status when the database is unreachable', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    const res = mockResponse();
    const result = await controller.check(res);

    expect(result.status).toBe('error');
    expect(result.database).toBe('error');
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
