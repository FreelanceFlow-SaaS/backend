import { ApiProperty } from '@nestjs/swagger';
import { RevenueByClientDto } from './revenue-by-client.dto';
import { RevenueByMonthDto } from './revenue-by-month.dto';

export class DashboardSummaryDto {
  @ApiProperty({
    description: 'Somme des totalTtc EUR des factures payées uniquement, format string Decimal.',
    example: '12500.00',
  })
  totalRevenueTtc: string;

  @ApiProperty({ description: 'Nombre total de factures du compte (tous statuts).', example: 7 })
  invoiceCount: number;

  @ApiProperty({ description: 'Nombre de factures payées.', example: 3 })
  paidCount: number;

  @ApiProperty({ description: 'Nombre de factures envoyées.', example: 2 })
  sentCount: number;

  @ApiProperty({ description: 'Nombre de factures en brouillon.', example: 1 })
  draftCount: number;

  @ApiProperty({ description: 'Nombre de factures annulées.', example: 1 })
  cancelledCount: number;

  @ApiProperty({
    description: 'Revenu TTC par client (factures payées uniquement), trié par revenu décroissant.',
    type: [RevenueByClientDto],
  })
  revenueByClient: RevenueByClientDto[];

  @ApiProperty({
    description:
      'Revenu TTC par mois calendaire Europe/Paris (factures payées uniquement), trié chronologiquement.',
    type: [RevenueByMonthDto],
  })
  revenueByMonth: RevenueByMonthDto[];
}
