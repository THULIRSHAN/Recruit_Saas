import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  TalentPool,
  TalentPoolCandidate,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddCandidateDto } from './dto/add-candidate.dto';
import { CreateTalentPoolDto } from './dto/create-talent-pool.dto';

const TALENT_POOL_NOT_FOUND_MESSAGE = 'Talent pool not found.';
const NO_ORG_CONTEXT_MESSAGE = 'No organization in session context.';

@Injectable()
export class TalentPoolsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string | null, dto: CreateTalentPoolDto) {
    const organizationId = this.requireOrgId(orgId);
    const pool = await this.prisma.talentPool.create({
      data: { organizationId, name: dto.name },
    });
    return this.toDetail(pool, []);
  }

  async list(orgId: string | null) {
    const organizationId = this.requireOrgId(orgId);
    const pools = await this.prisma.talentPool.findMany({
      where: { organizationId },
      include: { candidates: true },
      orderBy: { name: 'asc' },
    });
    const candidates = await this.loadCandidates(
      pools.flatMap((pool) => pool.candidates),
    );
    return pools.map((pool) =>
      this.toDetail(pool, pool.candidates, candidates),
    );
  }

  async getOne(orgId: string | null, id: string) {
    const organizationId = this.requireOrgId(orgId);
    const pool = await this.requirePool(organizationId, id);
    const candidates = await this.loadCandidates(pool.candidates);
    return this.toDetail(pool, pool.candidates, candidates);
  }

  // REQ-POOL-001/Q30: a candidate can only be tagged if they've actually
  // applied to this org -- there is no separate candidate directory, and
  // this also prevents pooling arbitrary platform users. Same "invalid
  // reference in the request body" shape as Q18's cvId/pipelineTemplateId
  // -- 422, not 404, since dto.candidateId is a body field, not a URL
  // param naming a specific resource.
  async addCandidate(orgId: string | null, id: string, dto: AddCandidateDto) {
    const organizationId = this.requireOrgId(orgId);
    await this.requirePool(organizationId, id);

    const hasApplied = await this.prisma.application.findFirst({
      where: { candidateId: dto.candidateId, organizationId },
    });
    if (!hasApplied) {
      throw new UnprocessableEntityException(
        'candidateId has not applied to this organization.',
      );
    }

    try {
      await this.prisma.talentPoolCandidate.create({
        data: { talentPoolId: id, candidateId: dto.candidateId },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Candidate is already in this talent pool.',
        );
      }
      throw error;
    }
    return this.getOne(orgId, id);
  }

  async removeCandidate(orgId: string | null, id: string, candidateId: string) {
    const organizationId = this.requireOrgId(orgId);
    await this.requirePool(organizationId, id);

    const deleted = await this.prisma.talentPoolCandidate.deleteMany({
      where: { talentPoolId: id, candidateId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('Candidate is not in this talent pool.');
    }
    return this.getOne(orgId, id);
  }

  // TalentPoolCandidate.candidateId has no Prisma @relation to User (same
  // established pattern as Document.uploadedById) -- fetched as a
  // separate, explicit lookup rather than a relational include.
  private async loadCandidates(members: TalentPoolCandidate[]) {
    const candidateIds = [...new Set(members.map((m) => m.candidateId))];
    if (candidateIds.length === 0) {
      return new Map<string, { id: string; fullName: string; email: string }>();
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: candidateIds } },
      select: { id: true, fullName: true, email: true },
    });
    return new Map(users.map((user) => [user.id, user]));
  }

  private async requirePool(organizationId: string, id: string) {
    const pool = await this.prisma.talentPool.findFirst({
      where: { id, organizationId },
      include: { candidates: true },
    });
    if (!pool) {
      throw new NotFoundException(TALENT_POOL_NOT_FOUND_MESSAGE);
    }
    return pool;
  }

  private requireOrgId(orgId: string | null): string {
    if (!orgId) {
      throw new NotFoundException(NO_ORG_CONTEXT_MESSAGE);
    }
    return orgId;
  }

  private toDetail(
    pool: TalentPool,
    members: TalentPoolCandidate[],
    candidates?: Map<string, { id: string; fullName: string; email: string }>,
  ) {
    return {
      id: pool.id,
      name: pool.name,
      candidates: members.map((member) => {
        const candidate = candidates?.get(member.candidateId);
        return {
          id: member.candidateId,
          fullName: candidate?.fullName ?? null,
          email: candidate?.email ?? null,
          addedAt: member.addedAt,
        };
      }),
    };
  }
}
