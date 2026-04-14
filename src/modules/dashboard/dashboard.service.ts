import { Injectable } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DashboardSummaryDto } from './dto/dashboard-summary.dto';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(DashboardService.name)
    private readonly logger: PinoLogger
  ) {}

  async getSummary(userId: string): Promise<DashboardSummaryDto> {
    // Single round-trip: aggregate revenue + group-by status counts together.
    const [revenueResult, statusCounts] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { userId, status: InvoiceStatus.paid },
        _sum: { totalTtc: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
      }),
    ]);

    const countByStatus = Object.fromEntries(
      statusCounts.map((row) => [row.status, row._count._all])
    ) as Partial<Record<InvoiceStatus, number>>;

    const invoiceCount = statusCounts.reduce((sum, row) => sum + row._count._all, 0);

    // Use toFixed(2) — Decimal.toString() can produce exponential notation for large values.
    // Fall back to Decimal(0) to keep type consistent (avoids number/Decimal coercion).
    const totalRevenueTtc = (revenueResult._sum.totalTtc ?? new Prisma.Decimal(0)).toFixed(2);

    this.logger.info({ event: 'dashboard_summary_fetched', userId }, 'dashboard summary fetched');

    return {
      totalRevenueTtc,
      invoiceCount,
      paidCount: countByStatus[InvoiceStatus.paid] ?? 0,
      sentCount: countByStatus[InvoiceStatus.sent] ?? 0,
      draftCount: countByStatus[InvoiceStatus.draft] ?? 0,
      cancelledCount: countByStatus[InvoiceStatus.cancelled] ?? 0,
    };
  }
}
