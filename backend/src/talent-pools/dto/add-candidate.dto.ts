import { IsNotEmpty, IsString } from 'class-validator';

export class AddCandidateDto {
  @IsString()
  @IsNotEmpty()
  candidateId!: string;
}
