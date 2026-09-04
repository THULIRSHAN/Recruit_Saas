import { IsIn } from 'class-validator';

// REQ-SUB-001. Plan.key values are seeded, not user-editable -- see
// prisma/seed.ts's PLANS catalog.
export class SelectPlanDto {
  @IsIn(['FREE', 'STARTER', 'PRO'])
  planKey!: string;
}
