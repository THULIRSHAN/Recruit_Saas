import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Education, Experience, Skill, CV } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { detectCvFileKind } from './cv-file-signature.util';
import { ReplaceEducationDto } from './dto/replace-education.dto';
import { ReplaceExperienceDto } from './dto/replace-experience.dto';
import { ReplaceSkillsDto } from './dto/replace-skills.dto';
import { UpdateCandidateProfileDto } from './dto/update-candidate-profile.dto';

const CV_NOT_FOUND_MESSAGE = 'CV not found.';
// docs/security.md §11's own example figure.
const MAX_CV_SIZE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  // REQ-CAND-001: every authenticated user is implicitly a candidate
  // (docs/open-questions.md Q11/Q19) -- `userId` comes only from the
  // caller's own token, never a client-supplied id, so there is no
  // cross-tenant/cross-candidate surface for this endpoint at all. No
  // profile row is created just from a read.
  async getMine(userId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { userId },
      include: { education: true, experience: true, skills: true, cvs: true },
    });
    if (!profile) {
      return this.toDetail(null);
    }
    return this.toDetail(profile);
  }

  // Upserts -- there is no separate "create profile" step; the first
  // PATCH creates it.
  async updateMine(userId: string, dto: UpdateCandidateProfileDto) {
    const profile = await this.prisma.candidateProfile.upsert({
      where: { userId },
      create: {
        userId,
        headline: dto.headline,
        location: dto.location,
        phone: dto.phone,
      },
      update: {
        ...(dto.headline !== undefined ? { headline: dto.headline } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      },
      include: { education: true, experience: true, skills: true, cvs: true },
    });
    return this.toDetail(profile);
  }

  async replaceEducation(userId: string, dto: ReplaceEducationDto) {
    await this.ensureProfile(userId);
    const education = await this.prisma.$transaction(async (tx) => {
      await tx.education.deleteMany({ where: { candidateId: userId } });
      if (dto.education.length > 0) {
        await tx.education.createMany({
          data: dto.education.map((item) => ({
            candidateId: userId,
            institution: item.institution,
            degree: item.degree,
            startYear: item.startYear,
            endYear: item.endYear,
          })),
        });
      }
      return tx.education.findMany({ where: { candidateId: userId } });
    });
    return education.map((item) => this.toEducationDetail(item));
  }

  async replaceExperience(userId: string, dto: ReplaceExperienceDto) {
    await this.ensureProfile(userId);
    const experience = await this.prisma.$transaction(async (tx) => {
      await tx.experience.deleteMany({ where: { candidateId: userId } });
      if (dto.experience.length > 0) {
        await tx.experience.createMany({
          data: dto.experience.map((item) => ({
            candidateId: userId,
            company: item.company,
            title: item.title,
            startDate: item.startDate ? new Date(item.startDate) : undefined,
            endDate: item.endDate ? new Date(item.endDate) : undefined,
            description: item.description,
          })),
        });
      }
      return tx.experience.findMany({ where: { candidateId: userId } });
    });
    return experience.map((item) => this.toExperienceDetail(item));
  }

  async replaceSkills(userId: string, dto: ReplaceSkillsDto) {
    await this.ensureProfile(userId);
    const skills = await this.prisma.$transaction(async (tx) => {
      await tx.skill.deleteMany({ where: { candidateId: userId } });
      if (dto.skills.length > 0) {
        await tx.skill.createMany({
          data: dto.skills.map((name) => ({ candidateId: userId, name })),
        });
      }
      return tx.skill.findMany({ where: { candidateId: userId } });
    });
    return skills.map((item) => this.toSkillDetail(item));
  }

  // REQ-CAND-002: PDF/DOC/DOCX only, 5MB max, validated by content not just
  // extension/MIME (docs/security.md §11). The first CV a candidate
  // uploads becomes primary automatically -- REQ-APP-001 needs at least
  // one CV to exist to apply, so an empty candidate shouldn't have to
  // remember a separate "set primary" step just to reach that state.
  async uploadCv(userId: string, file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException('A CV file is required.');
    }
    if (file.size > MAX_CV_SIZE_BYTES) {
      throw new BadRequestException('CV file exceeds the 5MB size limit.');
    }
    if (!detectCvFileKind(file.buffer)) {
      throw new BadRequestException('CV must be a PDF, DOC, or DOCX file.');
    }

    await this.ensureProfile(userId);
    const { key } = await this.storageService.upload(
      file.buffer,
      file.originalname,
    );
    const existingCount = await this.prisma.cV.count({
      where: { candidateId: userId },
    });
    const cv = await this.prisma.cV.create({
      data: {
        candidateId: userId,
        fileKey: key,
        fileName: file.originalname,
        isPrimary: existingCount === 0,
      },
    });
    return this.toCvDetail(cv);
  }

  async setPrimaryCv(userId: string, cvId: string) {
    const cv = await this.requireOwnCv(userId, cvId);
    const [, updated] = await this.prisma.$transaction([
      this.prisma.cV.updateMany({
        where: { candidateId: userId, id: { not: cvId } },
        data: { isPrimary: false },
      }),
      this.prisma.cV.update({
        where: { id: cv.id },
        data: { isPrimary: true },
      }),
    ]);
    return this.toCvDetail(updated);
  }

  async deleteCv(userId: string, cvId: string) {
    const cv = await this.requireOwnCv(userId, cvId);
    await this.prisma.cV.delete({ where: { id: cv.id } });
    await this.storageService.delete(cv.fileKey);
  }

  async getCvSignedUrl(userId: string, cvId: string) {
    const cv = await this.requireOwnCv(userId, cvId);
    const signed = await this.storageService.getSignedUrl(cv.fileKey);
    return { url: signed.url, expiresAt: signed.expiresAt };
  }

  private async requireOwnCv(userId: string, cvId: string) {
    const cv = await this.prisma.cV.findFirst({
      where: { id: cvId, candidateId: userId },
    });
    if (!cv) {
      throw new NotFoundException(CV_NOT_FOUND_MESSAGE);
    }
    return cv;
  }

  private toCvDetail(cv: CV) {
    return {
      id: cv.id,
      fileName: cv.fileName,
      isPrimary: cv.isPrimary,
      uploadedAt: cv.uploadedAt,
    };
  }

  private async ensureProfile(userId: string) {
    await this.prisma.candidateProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  private toDetail(
    profile: {
      headline: string | null;
      location: string | null;
      phone: string | null;
      education: Education[];
      experience: Experience[];
      skills: Skill[];
      cvs: CV[];
    } | null,
  ) {
    return {
      headline: profile?.headline ?? null,
      location: profile?.location ?? null,
      phone: profile?.phone ?? null,
      education: (profile?.education ?? []).map((item) =>
        this.toEducationDetail(item),
      ),
      experience: (profile?.experience ?? []).map((item) =>
        this.toExperienceDetail(item),
      ),
      skills: (profile?.skills ?? []).map((item) => this.toSkillDetail(item)),
      cvs: (profile?.cvs ?? []).map((cv) => this.toCvDetail(cv)),
    };
  }

  private toEducationDetail(item: Education) {
    return {
      id: item.id,
      institution: item.institution,
      degree: item.degree,
      startYear: item.startYear,
      endYear: item.endYear,
    };
  }

  private toExperienceDetail(item: Experience) {
    return {
      id: item.id,
      company: item.company,
      title: item.title,
      startDate: item.startDate,
      endDate: item.endDate,
      description: item.description,
    };
  }

  private toSkillDetail(item: Skill) {
    return { id: item.id, name: item.name };
  }
}
