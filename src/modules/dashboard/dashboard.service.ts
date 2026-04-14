import { Injectable } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DashboardSummaryDto } from './dto/dashboard-summary.dto';
import { RevenueByClientDto } from './dto/revenue-by-client.dto';
import { RevenueByMonthDto } from './dto/revenue-by-month.dto';

// Raw query result types
type ClientRevenueRow = { clientId: string; clientName: string; totalTtc: Prisma.Decimal };
type MonthRevenueRow = { month: string; totalTtc: Prisma.Decimal };

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(DashboardService.name)
    private readonly logger: PinoLogger
  ) {}

  async getSummary(userId: string): Promise<DashboardSummaryDto> {
    // All queries run in parallel — single network round-trip batch.
    const [revenueResult, statusCounts, clientRows, monthRows] = await Promise.all([
      // 1. Total revenue (paid only)
      this.prisma.invoice.aggregate({
        where: { userId, status: InvoiceStatus.paid },
        _sum: { totalTtc: true },
      }),

      // 2. Count per status (all invoices)
      this.prisma.invoice.groupBy({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
      }),

      // 3. Revenue by client (paid only) — raw SQL to join client name in one query.
      //    Tenant isolation enforced by user_id filter on invoices; client name
      //    is fetched only for clients that belong to the same user via the JOIN.
      this.prisma.$queryRaw<ClientRevenueRow[]>`
        SELECT
          c.id          AS "clientId",
          c.name        AS "clientName",
          SUM(i.total_ttc)::numeric AS "totalTtc"
        FROM invoices i
        JOIN clients c ON c.id = i.client_id
        WHERE i.user_id = ${userId}::uuid
          AND i.status  = 'paid'
        GROUP BY c.id, c.name
        ORDER BY SUM(i.total_ttc) DESC
      `,

      // 4. Revenue by calendar month in Europe/Paris timezone (paid only).
      //    paidAt is the authoritative payment date (set at paid transition).
      //    Months are returned as YYYY-MM strings, sorted chronologically.
      this.prisma.$queryRaw<MonthRevenueRow[]>`
        SELECT
          TO_CHAR(
            paid_at AT TIME ZONE 'Europe/Paris',
            'YYYY-MM'
          )               AS "month",
          SUM(total_ttc)::numeric AS "totalTtc"
        FROM invoices
        WHERE user_id = ${userId}::uuid
          AND status   = 'paid'
          AND paid_at IS NOT NULL
        GROUP BY 1
        ORDER BY 1 ASC
      `,
    ]);

    const countByStatus = Object.fromEntries(
      statusCounts.map((row) => [row.status, row._count._all])
    ) as Partial<Record<InvoiceStatus, number>>;

    const invoiceCount = statusCounts.reduce((sum, row) => sum + row._count._all, 0);

    // toFixed(2) — Decimal.toString() can produce exponential notation for large values.
    const totalRevenueTtc = (revenueResult._sum.totalTtc ?? new Prisma.Decimal(0)).toFixed(2);

    const revenueByClient: RevenueByClientDto[] = clientRows.map((row) => ({
      clientId: row.clientId,
      clientName: row.clientName,
      totalTtc: new Prisma.Decimal(row.totalTtc).toFixed(2),
    }));

    const revenueByMonth: RevenueByMonthDto[] = monthRows.map((row) => ({
      month: row.month,
      totalTtc: new Prisma.Decimal(row.totalTtc).toFixed(2),
    }));

    this.logger.info(
      {
        event: 'dashboard_summary_fetched',
        userId,
        clientBreakdowns: revenueByClient.length,
        monthBreakdowns: revenueByMonth.length,
      },
      'dashboard summary fetched'
    );

    return {
      totalRevenueTtc,
      invoiceCount,
      paidCount: countByStatus[InvoiceStatus.paid] ?? 0,
      sentCount: countByStatus[InvoiceStatus.sent] ?? 0,
      draftCount: countByStatus[InvoiceStatus.draft] ?? 0,
      cancelledCount: countByStatus[InvoiceStatus.cancelled] ?? 0,
      revenueByClient,
      revenueByMonth,
    };
  }
}
