import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePipelineTemplateDto } from './dto/create-pipeline-template.dto';
import { ListPipelineTemplatesQueryDto } from './dto/list-pipeline-templates-query.dto';
import { UpdatePipelineTemplateDto } from './dto/update-pipeline-template.dto';

const TEMPLATE_NOT_FOUND_MESSAGE = 'Pipeline template not found.';
// Unreachable in practice -- see JobsService's identical note (a resolved
// orgId is implied by holding any org-scoped permission at all).
const NO_ORG_CONTEXT_MESSAGE = 'No organization in session context.';

type TemplateWithStages = Awaited<
  ReturnType<PipelineTemplatesService['findWithStages']>
>;

@Injectable()
export class PipelineTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string | null, dto: CreatePipelineTemplateDto) {
    const organizationId = this.requireOrgId(orgId);
    const template = await this.prisma.pipelineTemplate.create({
      data: {
        organizationId,
        name: dto.name,
        stages: {
          create: dto.stages.map((name, index) => ({ name, order: index })),
        },
      },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    return this.toDetail(template);
  }

  async list(orgId: string | null, query: ListPipelineTemplatesQueryDto) {
    const organizationId = this.requireOrgId(orgId);
    const where = { organizationId };

    const [data, total] = await Promise.all([
      this.prisma.pipelineTemplate.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { stages: { orderBy: { order: 'asc' } } },
      }),
      this.prisma.pipelineTemplate.count({ where }),
    ]);

    return {
      data: data.map((template) => this.toDetail(template)),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // Defense-in-depth TenantGuard (@RequireTenant({ model: 'pipelineTemplate' }))
  // 404s a cross-tenant :id at the controller, but this organizationId
  // filter is the authoritative check (docs/multi-tenancy.md §3).
  async getOne(orgId: string | null, id: string) {
    const organizationId = this.requireOrgId(orgId);
    const template = await this.findWithStages(id, organizationId);
    if (!template) {
      throw new NotFoundException(TEMPLATE_NOT_FOUND_MESSAGE);
    }
    return this.toDetail(template);
  }

  async update(
    orgId: string | null,
    id: string,
    dto: UpdatePipelineTemplateDto,
  ) {
    const organizationId = this.requireOrgId(orgId);
    const existing = await this.findWithStages(id, organizationId);
    if (!existing) {
      throw new NotFoundException(TEMPLATE_NOT_FOUND_MESSAGE);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.name !== undefined) {
        await tx.pipelineTemplate.update({
          where: { id },
          data: { name: dto.name },
        });
      }
      if (dto.stages !== undefined) {
        await tx.pipelineStageTemplate.deleteMany({
          where: { pipelineTemplateId: id },
        });
        await tx.pipelineStageTemplate.createMany({
          data: dto.stages.map((name, index) => ({
            pipelineTemplateId: id,
            name,
            order: index,
          })),
        });
      }
      return tx.pipelineTemplate.findUniqueOrThrow({
        where: { id },
        include: { stages: { orderBy: { order: 'asc' } } },
      });
    });

    return this.toDetail(updated);
  }

  // Real hard delete -- unlike Job/Application (docs/api.md §1: never
  // hard-deleted, archived/withdrawn instead), a PipelineTemplate is a
  // reusable preset with no history to preserve: RecruitmentStage rows are
  // snapshotted per-job (independent of the template), so deleting one
  // never touches an existing job's pipeline.
  async remove(orgId: string | null, id: string) {
    const organizationId = this.requireOrgId(orgId);
    const existing = await this.prisma.pipelineTemplate.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException(TEMPLATE_NOT_FOUND_MESSAGE);
    }
    await this.prisma.pipelineTemplate.delete({ where: { id } });
  }

  private findWithStages(id: string, organizationId: string) {
    return this.prisma.pipelineTemplate.findFirst({
      where: { id, organizationId },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
  }

  private requireOrgId(orgId: string | null): string {
    if (!orgId) {
      throw new NotFoundException(NO_ORG_CONTEXT_MESSAGE);
    }
    return orgId;
  }

  private toDetail(template: NonNullable<TemplateWithStages>) {
    return {
      id: template.id,
      organizationId: template.organizationId,
      name: template.name,
      stages: template.stages.map((stage) => ({
        id: stage.id,
        name: stage.name,
        order: stage.order,
      })),
    };
  }
}
