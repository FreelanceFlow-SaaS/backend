import { ApiProperty } from '@nestjs/swagger';

export class RevenueByMonthDto {
  @ApiProperty({
    description:
      'Mois calendaire en Europe/Paris, format ISO YYYY-MM. ' +
      'Basé sur paidAt converti en heure locale Paris (CET/CEST).',
    example: '2026-04',
  })
  month: string;

  @ApiProperty({
    description: 'Revenu TTC EUR payé ce mois, string Decimal.',
    example: '3200.00',
  })
  totalTtc: string;
}
