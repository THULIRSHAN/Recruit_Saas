import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterOrganizationDto } from './dto/register-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  // REQ-AUTH-002: creates the Organization (PENDING_APPROVAL by default),
  // the owner User, and the COMPANY_OWNER UserOrganizationRole row all in
  // one transaction -- an explicit business rule, not just tidiness (a
  // partial failure must never leave an Organization with no owner, or a
  // User account with no role, dangling).
  async registerOrganization(dto: RegisterOrganizationDto) {
    return this.prisma.$transaction(async (tx) => {
      const { user } = await this.authService.createUserAccount(
        {
          email: dto.ownerEmail,
          password: dto.ownerPassword,
          fullName: dto.ownerFullName,
        },
        tx,
      );

      const organization = await tx.organization.create({
        data: { name: dto.organizationName },
      });

      const ownerRole = await tx.role.findUniqueOrThrow({
        where: { key: 'COMPANY_OWNER' },
      });
      await tx.userOrganizationRole.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          roleId: ownerRole.id,
        },
      });

      return {
        organization: {
          id: organization.id,
          name: organization.name,
          status: organization.status,
        },
        owner: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
      };
    });
  }
}
