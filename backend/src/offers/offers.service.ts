import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationsService } from '../applications/applications.service';
import {
  ApplicationStatus,
  Offer,
  OfferStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { ListOrgOffersQueryDto } from './dto/list-org-offers-query.dto';
import { RespondOfferDto } from './dto/respond-offer.dto';

const OFFER_NOT_FOUND_MESSAGE = 'Offer not found.';
const NO_ORG_CONTEXT_MESSAGE = 'No organization in session context.';

const orgOfferInclude = {
  application: {
    select: {
      id: true,
      candidate: { select: { id: true, fullName: true, email: true } },
      job: { select: { id: true, title: true } },
    },
  },
} satisfies Prisma.OfferInclude;

type OfferWithApplication = Prisma.OfferGetPayload<{
  include: typeof orgOfferInclude;
}>;

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applicationsService: ApplicationsService,
  ) {}

  // REQ-OFFER-001: only a HIRED application can receive an offer.
  // Delegates existence/tenant scoping to ApplicationsService.getForJob()
  // rather than querying prisma.application directly (CLAUDE.md rule 4).
  async create(
    orgId: string | null,
    jobId: string,
    applicationId: string,
    dto: CreateOfferDto,
  ) {
    const organizationId = this.requireOrgId(orgId);
    const application = await this.applicationsService.getForJob(
      organizationId,
      jobId,
      applicationId,
    );
    if (application.status !== ApplicationStatus.HIRED) {
      throw new ConflictException(
        `Cannot create an offer for a(n) ${application.status.toLowerCase()} application.`,
      );
    }

    const expiresAt = new Date(dto.expiresAt);
    if (expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('expiresAt must be in the future.');
    }

    try {
      const offer = await this.prisma.offer.create({
        data: {
          applicationId,
          organizationId,
          title: dto.title,
          compensation: dto.compensation,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          expiresAt,
        },
      });
      return this.toDetail(offer);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An offer already exists for this application.',
        );
      }
      throw error;
    }
  }

  // REQ-OFFER-001's implied "track every offer I've sent" view -- Offer
  // already denormalizes organizationId (see the model comment), so this
  // needs no traversal through Application/Job to scope it.
  async listForOrg(orgId: string | null, query: ListOrgOffersQueryDto) {
    const organizationId = this.requireOrgId(orgId);
    const where = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.offer.findMany({
        where,
        include: orgOfferInclude,
        orderBy: { sentAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.offer.count({ where }),
    ]);

    // Same lazy SENT->EXPIRED flip as the single-offer reads, applied to
    // this page only (bounded by pageSize) rather than a scheduled job.
    const expired = await Promise.all(
      data.map(async (offer) => ({
        ...offer,
        ...(await this.expireIfNeeded(offer)),
      })),
    );

    return {
      data: expired.map((offer) => this.toOrgListDetail(offer)),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getForJob(orgId: string | null, jobId: string, applicationId: string) {
    const organizationId = this.requireOrgId(orgId);
    await this.applicationsService.getForJob(
      organizationId,
      jobId,
      applicationId,
    );
    const offer = await this.requireOfferForApplication(
      applicationId,
      organizationId,
    );
    return this.toDetail(await this.expireIfNeeded(offer));
  }

  // REQ-OFFER-002. Ownership is verified via
  // ApplicationsService.getMine() (candidateId filter), same pattern used
  // throughout M7-M9 for candidate-self-scoped resources.
  async getMine(candidateId: string, applicationId: string) {
    await this.applicationsService.getMine(candidateId, applicationId);
    const offer = await this.requireOfferForApplication(applicationId);
    return this.toDetail(await this.expireIfNeeded(offer));
  }

  // REQ-OFFER-002: accept/decline within the expiry window. Q26: on
  // DECLINE, Offer.status becomes the authoritative record of what
  // happened to *this* offer -- Application.status deliberately stays
  // HIRED; reopening the pipeline back to ACTIVE is out of scope (deferred
  // alongside Q22's generic backward-stage-move capability).
  async respond(
    candidateId: string,
    applicationId: string,
    dto: RespondOfferDto,
  ) {
    await this.applicationsService.getMine(candidateId, applicationId);
    const offer = await this.expireIfNeeded(
      await this.requireOfferForApplication(applicationId),
    );
    if (offer.status !== OfferStatus.SENT) {
      throw new ConflictException(
        `Offer is already ${offer.status.toLowerCase()}.`,
      );
    }

    const updated = await this.prisma.offer.update({
      where: { id: offer.id },
      data: {
        status:
          dto.decision === 'ACCEPT'
            ? OfferStatus.ACCEPTED
            : OfferStatus.DECLINED,
        respondedAt: new Date(),
      },
    });
    return this.toDetail(updated);
  }

  // Lazily flips a SENT offer past its expiry window to EXPIRED on
  // access, rather than requiring a scheduled job for a P1-scope feature.
  private async expireIfNeeded(offer: Offer): Promise<Offer> {
    if (
      offer.status === OfferStatus.SENT &&
      offer.expiresAt.getTime() < Date.now()
    ) {
      return this.prisma.offer.update({
        where: { id: offer.id },
        data: { status: OfferStatus.EXPIRED },
      });
    }
    return offer;
  }

  private async requireOfferForApplication(
    applicationId: string,
    organizationId?: string,
  ) {
    const offer = await this.prisma.offer.findFirst({
      where: {
        applicationId,
        ...(organizationId ? { organizationId } : {}),
      },
    });
    if (!offer) {
      throw new NotFoundException(OFFER_NOT_FOUND_MESSAGE);
    }
    return offer;
  }

  private requireOrgId(orgId: string | null): string {
    if (!orgId) {
      throw new NotFoundException(NO_ORG_CONTEXT_MESSAGE);
    }
    return orgId;
  }

  private toDetail(offer: Offer) {
    return {
      id: offer.id,
      title: offer.title,
      compensation: offer.compensation,
      startDate: offer.startDate,
      expiresAt: offer.expiresAt,
      status: offer.status,
      sentAt: offer.sentAt,
      respondedAt: offer.respondedAt,
    };
  }

  private toOrgListDetail(offer: OfferWithApplication) {
    return {
      ...this.toDetail(offer),
      applicationId: offer.application.id,
      candidate: {
        id: offer.application.candidate.id,
        fullName: offer.application.candidate.fullName,
        email: offer.application.candidate.email,
      },
      job: { id: offer.application.job.id, title: offer.application.job.title },
    };
  }
}
