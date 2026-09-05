import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, University } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnershipDto } from './dto/create-partnership.dto';
import { CreateUniversityDto } from './dto/create-university.dto';

const PARTNERSHIP_NOT_FOUND_MESSAGE = 'Partnership not found.';
const NO_ORG_CONTEXT_MESSAGE = 'No organization in session context.';

const partnershipInclude = {
  university: true,
} satisfies Prisma.UniversityPartnershipInclude;

type PartnershipWithUniversity = Prisma.UniversityPartnershipGetPayload<{
  include: typeof partnershipInclude;
}>;

@Injectable()
export class UniversitiesService {
  constructor(private readonly prisma: PrismaService) {}

  // REQ-UNI-001/Q31: a public, platform-wide catalog -- same reasoning as
  // GET /plans, no tenant data is exposed.
  async list() {
    const universities = await this.prisma.university.findMany({
      orderBy: { name: 'asc' },
    });
    return universities.map((university) =>
      this.toUniversityDetail(university),
    );
  }

  // Super Admin only. University.name is @unique in the schema.
  async create(dto: CreateUniversityDto) {
    try {
      const university = await this.prisma.university.create({
        data: { name: dto.name },
      });
      return this.toUniversityDetail(university);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A university with this name already exists.',
        );
      }
      throw error;
    }
  }

  async listPartnerships(orgId: string | null) {
    const organizationId = this.requireOrgId(orgId);
    const partnerships = await this.prisma.universityPartnership.findMany({
      where: { organizationId },
      include: partnershipInclude,
      orderBy: { startedAt: 'desc' },
    });
    return partnerships.map((partnership) =>
      this.toPartnershipDetail(partnership),
    );
  }

  // dto.universityId is the "reference in the caller's own request body"
  // case, same family as Q18's cvId/pipelineTemplateId -- 422 when it
  // doesn't refer to a real University, not a direct-URL-access 404.
  async createPartnership(orgId: string | null, dto: CreatePartnershipDto) {
    const organizationId = this.requireOrgId(orgId);
    const university = await this.prisma.university.findUnique({
      where: { id: dto.universityId },
    });
    if (!university) {
      throw new UnprocessableEntityException(
        'universityId does not refer to an existing university.',
      );
    }

    try {
      const partnership = await this.prisma.universityPartnership.create({
        data: { organizationId, universityId: dto.universityId },
        include: partnershipInclude,
      });
      return this.toPartnershipDetail(partnership);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Already partnered with this university.');
      }
      throw error;
    }
  }

  async removePartnership(orgId: string | null, universityId: string) {
    const organizationId = this.requireOrgId(orgId);
    const deleted = await this.prisma.universityPartnership.deleteMany({
      where: { organizationId, universityId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException(PARTNERSHIP_NOT_FOUND_MESSAGE);
    }
  }

  private requireOrgId(orgId: string | null): string {
    if (!orgId) {
      throw new NotFoundException(NO_ORG_CONTEXT_MESSAGE);
    }
    return orgId;
  }

  private toUniversityDetail(university: University) {
    return { id: university.id, name: university.name };
  }

  private toPartnershipDetail(partnership: PartnershipWithUniversity) {
    return {
      id: partnership.id,
      startedAt: partnership.startedAt,
      university: this.toUniversityDetail(partnership.university),
    };
  }
}
