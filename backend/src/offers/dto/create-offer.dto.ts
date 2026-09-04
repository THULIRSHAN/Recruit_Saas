import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

// REQ-OFFER-001. Offer-letter document attachment is out of scope for
// this ticket (Q26) -- Document has no relation to Offer in the schema.
export class CreateOfferDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  compensation?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsDateString()
  expiresAt!: string;
}
