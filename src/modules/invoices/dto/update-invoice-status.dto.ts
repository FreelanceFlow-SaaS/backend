import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';

export class UpdateInvoiceStatusDto {
  @ApiProperty({
    enum: InvoiceStatus,
    example: InvoiceStatus.sent,
    description:
      'Nouveau statut. Transitions autorisées: draft→sent, draft→cancelled, sent→paid, sent→cancelled',
  })
  @IsEnum(InvoiceStatus, {
    message: 'Statut de facture invalide. Valeurs acceptées: draft, sent, paid, cancelled',
  })
  status: InvoiceStatus;
}
