import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationsService } from '../applications/applications.service';
import { OfferStatus, Prisma } from '../generated/prisma/client';
import { OffersService } from '../offers/offers.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AddTaskDto } from './dto/add-task.dto';
import { CreateChecklistDto } from './dto/create-checklist.dto';

const CHECKLIST_NOT_FOUND_MESSAGE =
  'Onboarding has not been started for this application.';
const TASK_NOT_FOUND_MESSAGE = 'Onboarding task not found.';
const NO_ORG_CONTEXT_MESSAGE = 'No organization in session context.';
// docs/security.md §11's own example figure -- same limit as CV upload.
const MAX_DOCUMENT_SIZE_BYTES = 5 * 1024 * 1024;

const checklistInclude = {
  tasks: {
    include: { documents: true },
    orderBy: { name: 'asc' },
  },
} satisfies Prisma.OnboardingChecklistInclude;

type ChecklistWithTasks = Prisma.OnboardingChecklistGetPayload<{
  include: typeof checklistInclude;
}>;

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applicationsService: ApplicationsService,
    private readonly offersService: OffersService,
    private readonly storageService: StorageService,
  ) {}

  // REQ-DOC-001/Q27: an explicit HR Manager action, gated on the offer
  // being ACCEPTED -- not automatic. Delegates existence/tenant/offer-
  // state scoping to OffersService.getForJob() rather than querying
  // prisma.offer/application directly (CLAUDE.md rule 4).
  async createChecklist(
    orgId: string | null,
    jobId: string,
    applicationId: string,
    dto: CreateChecklistDto,
  ) {
    const organizationId = this.requireOrgId(orgId);
    const offer = await this.offersService.getForJob(
      organizationId,
      jobId,
      applicationId,
    );
    if (offer.status !== OfferStatus.ACCEPTED) {
      throw new ConflictException(
        `Cannot start onboarding until the offer is accepted (currently ${offer.status.toLowerCase()}).`,
      );
    }

    try {
      const checklist = await this.prisma.onboardingChecklist.create({
        data: {
          offerId: offer.id,
          tasks: {
            create: dto.tasks.map((task) => ({
              name: task.name,
              required: task.required ?? true,
            })),
          },
        },
        include: checklistInclude,
      });
      return this.toDetail(checklist);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Onboarding has already been started for this application.',
        );
      }
      throw error;
    }
  }

  async getForJob(orgId: string | null, jobId: string, applicationId: string) {
    const organizationId = this.requireOrgId(orgId);
    const offer = await this.offersService.getForJob(
      organizationId,
      jobId,
      applicationId,
    );
    return this.toDetail(await this.requireChecklist(offer.id));
  }

  async addTask(
    orgId: string | null,
    jobId: string,
    applicationId: string,
    dto: AddTaskDto,
  ) {
    const organizationId = this.requireOrgId(orgId);
    const offer = await this.offersService.getForJob(
      organizationId,
      jobId,
      applicationId,
    );
    const checklist = await this.requireChecklist(offer.id);
    await this.prisma.onboardingTask.create({
      data: {
        checklistId: checklist.id,
        name: dto.name,
        required: dto.required ?? true,
      },
    });
    return this.getForJob(orgId, jobId, applicationId);
  }

  // REQ-ONB-001/Q27: a deliberate HR Manager review step -- a task never
  // auto-completes just because a document was uploaded against it.
  async completeTask(
    orgId: string | null,
    jobId: string,
    applicationId: string,
    taskId: string,
  ) {
    const organizationId = this.requireOrgId(orgId);
    const offer = await this.offersService.getForJob(
      organizationId,
      jobId,
      applicationId,
    );
    const checklist = await this.requireChecklist(offer.id);
    const task = await this.prisma.onboardingTask.findFirst({
      where: { id: taskId, checklistId: checklist.id },
    });
    if (!task) {
      throw new NotFoundException(TASK_NOT_FOUND_MESSAGE);
    }

    await this.prisma.onboardingTask.update({
      where: { id: task.id },
      data: { completedAt: new Date() },
    });
    return this.getForJob(orgId, jobId, applicationId);
  }

  // REQ-DOC-002. Ownership verified via ApplicationsService.getMine() ->
  // OffersService.getMine(), same chain as the rest of M11.
  async getMine(candidateId: string, applicationId: string) {
    const offer = await this.offersService.getMine(candidateId, applicationId);
    return this.toDetail(await this.requireChecklist(offer.id));
  }

  async uploadDocument(
    candidateId: string,
    applicationId: string,
    taskId: string,
    file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('A document file is required.');
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      throw new BadRequestException(
        'Document file exceeds the 5MB size limit.',
      );
    }

    const offer = await this.offersService.getMine(candidateId, applicationId);
    const checklist = await this.requireChecklist(offer.id);
    const task = await this.prisma.onboardingTask.findFirst({
      where: { id: taskId, checklistId: checklist.id },
    });
    if (!task) {
      throw new NotFoundException(TASK_NOT_FOUND_MESSAGE);
    }

    const { key } = await this.storageService.upload(
      file.buffer,
      file.originalname,
    );
    const document = await this.prisma.document.create({
      data: {
        taskId: task.id,
        uploadedById: candidateId,
        fileKey: key,
        fileName: file.originalname,
      },
    });
    return {
      id: document.id,
      fileName: document.fileName,
      uploadedAt: document.uploadedAt,
    };
  }

  private async requireChecklist(offerId: string) {
    const checklist = await this.prisma.onboardingChecklist.findUnique({
      where: { offerId },
      include: checklistInclude,
    });
    if (!checklist) {
      throw new NotFoundException(CHECKLIST_NOT_FOUND_MESSAGE);
    }
    return checklist;
  }

  private requireOrgId(orgId: string | null): string {
    if (!orgId) {
      throw new NotFoundException(NO_ORG_CONTEXT_MESSAGE);
    }
    return orgId;
  }

  private toDetail(checklist: ChecklistWithTasks) {
    return {
      id: checklist.id,
      createdAt: checklist.createdAt,
      tasks: checklist.tasks.map((task) => ({
        id: task.id,
        name: task.name,
        required: task.required,
        completedAt: task.completedAt,
        documents: task.documents.map((doc) => ({
          id: doc.id,
          fileName: doc.fileName,
          uploadedAt: doc.uploadedAt,
        })),
      })),
    };
  }
}
