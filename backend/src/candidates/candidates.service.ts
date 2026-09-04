import { Injectable } from '@nestjs/common';
import { Education, Experience, Skill, CV } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReplaceEducationDto } from './dto/replace-education.dto';
import { ReplaceExperienceDto } from './dto/replace-experience.dto';
import { ReplaceSkillsDto } from './dto/replace-skills.dto';
import { UpdateCandidateProfileDto } from './dto/update-candidate-profile.dto';

@Injectable()
export class CandidatesService {
  constructor(private readonly prisma: PrismaService) {}

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
      cvs: (profile?.cvs ?? []).map((cv) => ({
        id: cv.id,
        fileName: cv.fileName,
        isPrimary: cv.isPrimary,
        uploadedAt: cv.uploadedAt,
      })),
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
