import { IsString, IsOptional, Length, IsNotEmpty } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateFreelancerProfileDto {
  @ApiPropertyOptional({ example: 'Sophie Martin', description: 'Nom affiché sur les factures' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom affiché ne peut pas être vide' })
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({ example: 'Sophie Marie Martin', description: 'Nom légal complet' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom légal ne peut pas être vide' })
  @IsOptional()
  legalName?: string;

  @ApiPropertyOptional({ example: 'SophieDev SARL', description: 'Nom de la société (optionnel)' })
  @IsString()
  @IsOptional()
  companyName?: string;

  @ApiPropertyOptional({ example: '123 rue de la Paix', description: 'Adresse ligne 1' })
  @IsString()
  @IsNotEmpty({ message: "L'adresse ne peut pas être vide" })
  @IsOptional()
  addressLine1?: string;

  @ApiPropertyOptional({ example: 'Appartement 4B', description: 'Adresse ligne 2 (optionnel)' })
  @IsString()
  @IsOptional()
  addressLine2?: string;

  @ApiPropertyOptional({ example: '75001', description: 'Code postal (5 caractères)' })
  @IsString()
  @Length(5, 5, { message: 'Le code postal doit contenir 5 caractères' })
  @IsOptional()
  postalCode?: string;

  @ApiPropertyOptional({ example: 'Paris', description: 'Ville' })
  @IsString()
  @IsNotEmpty({ message: 'La ville ne peut pas être vide' })
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({
    example: 'FR',
    default: 'FR',
    description: 'Code pays ISO 3166-1 alpha-2 (2 caractères)',
  })
  @IsString()
  @Length(2, 2, { message: 'Le code pays doit contenir 2 caractères (ex: FR)' })
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({
    example: 'FR12345678901',
    description: 'Numéro de TVA intracommunautaire (optionnel)',
  })
  @IsString()
  @IsOptional()
  vatNumber?: string;

  @ApiPropertyOptional({
    example: '12345678901234',
    description: 'Numéro SIRET (14 chiffres, optionnel)',
  })
  @IsString()
  @Length(14, 14, { message: 'Le numéro SIRET doit contenir 14 chiffres' })
  @IsOptional()
  siret?: string;
}
