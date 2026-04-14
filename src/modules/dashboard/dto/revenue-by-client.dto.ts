import { ApiProperty } from '@nestjs/swagger';

export class RevenueByClientDto {
  @ApiProperty({ description: 'UUID du client.', example: 'a1b2c3d4-...' })
  clientId: string;

  @ApiProperty({ description: 'Nom du client.', example: 'Sophie Martin' })
  clientName: string;

  @ApiProperty({
    description: 'Revenu TTC EUR payé pour ce client, string Decimal.',
    example: '4800.00',
  })
  totalTtc: string;
}
