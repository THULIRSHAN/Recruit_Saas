import { IsIn } from 'class-validator';

export class RespondOfferDto {
  @IsIn(['ACCEPT', 'DECLINE'])
  decision!: 'ACCEPT' | 'DECLINE';
}
