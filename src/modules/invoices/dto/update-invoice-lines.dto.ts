import { IsArray, ArrayNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CreateInvoiceLineDto } from './create-invoice-line.dto';

// Replaces all lines on a draft invoice — atomic replace, not incremental patch
export class UpdateInvoiceLinesDto {
  @ApiProperty({
    type: [CreateInvoiceLineDto],
    description: 'Nouvelles lignes (remplace toutes les lignes existantes, minimum 1)',
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'La facture doit contenir au moins une ligne' })
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  lines: CreateInvoiceLineDto[];
}
