import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePartnershipDto {
  @IsString()
  @IsNotEmpty()
  universityId!: string;
}
