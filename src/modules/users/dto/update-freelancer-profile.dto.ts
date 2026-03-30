import { IsString, IsOptional, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateFreelancerProfileDto {
  @ApiProperty({
    description: 'Display name for invoices',
    example: 'Sophie Martin',
  })
  @IsString()
  displayName: string;

  @ApiProperty({
    description: 'Legal name',
    example: 'Sophie Marie Martin',
  })
  @IsString()
  legalName: string;

  @ApiPropertyOptional({
    description: 'Company name (optional)',
    example: 'SophieDev SARL',
  })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiProperty({
    description: 'Address line 1',
    example: '123 rue de la Paix',
  })
  @IsString()
  addressLine1: string;

  @ApiPropertyOptional({
    description: 'Address line 2 (optional)',
    example: 'Appartement 4B',
  })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiProperty({
    description: 'Postal code',
    example: '75001',
  })
  @IsString()
  @Length(5, 5)
  postalCode: string;

  @ApiProperty({
    description: 'City',
    example: 'Paris',
  })
  @IsString()
  city: string;

  @ApiProperty({
    description: 'Country code',
    example: 'FR',
    default: 'FR',
  })
  @IsString()
  @Length(2, 2)
  country: string;

  @ApiPropertyOptional({
    description: 'VAT number (optional for V1)',
    example: 'FR12345678901',
  })
  @IsOptional()
  @IsString()
  vatNumber?: string;

  @ApiPropertyOptional({
    description: 'SIRET number (optional for V1)',
    example: '12345678901234',
  })
  @IsOptional()
  @IsString()
  @Length(14, 14)
  siret?: string;
}