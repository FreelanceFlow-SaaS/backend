import {
  IsUUID,
  IsDateString,
  IsOptional,
  IsString,
  IsArray,
  ArrayNotEmpty,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateInvoiceLineDto } from './create-invoice-line.dto';

export class CreateInvoiceDto {
  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'UUID du client à facturer',
  })
  @IsUUID()
  clientId: string;

  @ApiProperty({ example: '2024-01-15', description: "Date d'émission (ISO 8601)" })
  @IsDateString({}, { message: "La date d'émission doit être une date valide (ISO 8601)" })
  issueDate: string;

  @ApiPropertyOptional({ example: '2024-02-15', description: "Date d'échéance (ISO 8601)" })
  @IsDateString({}, { message: "La date d'échéance doit être une date valide (ISO 8601)" })
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional({ example: 'EUR', default: 'EUR', description: 'Devise (défaut: EUR)' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty({ type: [CreateInvoiceLineDto], description: 'Lignes de facturation (minimum 1)' })
  @IsArray()
  @ArrayNotEmpty({ message: 'La facture doit contenir au moins une ligne' })
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  lines: CreateInvoiceLineDto[];
}
