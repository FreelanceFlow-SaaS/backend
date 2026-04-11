import { IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Only draft invoices can be updated; only metadata fields (not lines or status)
export class UpdateInvoiceDto {
  @ApiPropertyOptional({
    example: '2024-01-20',
    description: "Nouvelle date d'émission (ISO 8601)",
  })
  @IsDateString({}, { message: "La date d'émission doit être une date valide (ISO 8601)" })
  @IsOptional()
  issueDate?: string;

  @ApiPropertyOptional({
    example: '2024-02-20',
    description: "Nouvelle date d'échéance (ISO 8601)",
  })
  @IsDateString({}, { message: "La date d'échéance doit être une date valide (ISO 8601)" })
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional({ example: 'EUR', description: 'Devise' })
  @IsString()
  @IsOptional()
  currency?: string;
}
