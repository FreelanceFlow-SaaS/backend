import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { DashboardSummaryDto } from './dto/dashboard-summary.dto';

@ApiTags('Dashboard')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Résumé du tableau de bord',
    description:
      "Retourne le chiffre d'affaires TTC (factures payées uniquement) et les comptages par statut. " +
      'Le revenu est exprimé en EUR. La date de référence est paidAt si renseignée, sinon updatedAt.',
  })
  @ApiResponse({
    status: 200,
    description: 'Résumé du tableau de bord.',
    type: DashboardSummaryDto,
  })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  getSummary(@Req() req: any): Promise<DashboardSummaryDto> {
    return this.dashboardService.getSummary(req.user.id);
  }
}
