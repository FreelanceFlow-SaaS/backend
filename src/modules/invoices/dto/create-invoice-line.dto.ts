import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  IsUUID,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInvoiceLineDto {
  @ApiPropertyOptional({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'UUID de la prestation (optionnel — le taux est copié par snapshot)',
  })
  @IsUUID()
  @IsOptional()
  serviceId?: string;

  @ApiProperty({ example: 1, description: "Ordre d'affichage de la ligne (commence à 1)" })
  @IsNumber({}, { message: "L'ordre de ligne doit être un entier positif" })
  @Min(1)
  lineOrder: number;

  @ApiProperty({ example: 'Développement backend', description: 'Description de la prestation' })
  @IsString()
  @IsNotEmpty({ message: 'La description ne peut pas être vide' })
  description: string;

  @ApiProperty({ example: 2.5, description: 'Quantité (2 décimales max)' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'La quantité doit être un nombre valide (2 décimales max)' }
  )
  @IsPositive({ message: 'La quantité doit être supérieure à zéro' })
  quantity: number;

  @ApiProperty({
    example: 150.0,
    description: 'Prix unitaire HT en EUR (ignoré si serviceId fourni — remplacé par snapshot)',
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Le prix unitaire doit être un nombre valide (2 décimales max)' }
  )
  @IsPositive({ message: 'Le prix unitaire doit être supérieur à zéro' })
  unitPriceHt: number;

  @ApiProperty({ example: 0.2, description: 'Taux de TVA (0 à 1, ex: 0.20 pour 20%)' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 4 },
    { message: 'Le taux de TVA doit être un nombre valide (ex: 0.20 pour 20%)' }
  )
  @Min(0, { message: 'Le taux de TVA ne peut pas être négatif' })
  @Max(1, { message: 'Le taux de TVA ne peut pas dépasser 1 (100%)' })
  vatRate: number;
}
