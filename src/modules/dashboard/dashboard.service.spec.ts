import { DashboardService } from './dashboard.service';
import { mockLoggerValue } from '../../common/testing/mock-logger';
import { InvoiceStatus, Prisma } from '@prisma/client';
import type { DashboardSummaryDto } from './dto/dashboard-summary.dto';

const USER_ID = 'user-uuid-1';

const mockInvoiceReadCache = {
  getDashboardSummary: jest.fn(async (_uid: string, loader: () => Promise<DashboardSummaryDto>) =>
    loader()
  ),
};

const mockStatusCounts = [
  { status: InvoiceStatus.paid, _count: { _all: 3 } },
  { status: InvoiceStatus.sent, _count: { _all: 2 } },
  { status: InvoiceStatus.draft, _count: { _all: 1 } },
  { status: InvoiceStatus.cancelled, _count: { _all: 1 } },
];

const mockRevenueResult = {
  _sum: { totalTtc: new Prisma.Decimal('3500.00') },
};

const mockClientRows = [
  { clientId: 'client-1', clientName: 'Sophie Martin', totalTtc: new Prisma.Decimal('2000.00') },
  { clientId: 'client-2', clientName: 'Acme SAS', totalTtc: new Prisma.Decimal('1500.00') },
];

// December/January Paris boundary: two distinct months
const mockMonthRows = [
  { month: '2025-12', totalTtc: new Prisma.Decimal('1500.00') },
  { month: '2026-01', totalTtc: new Prisma.Decimal('2000.00') },
];

function buildMockPrisma(
  overrides: {
    aggregate?: unknown;
    groupBy?: unknown;
    clientRows?: unknown;
    monthRows?: unknown;
  } = {}
) {
  return {
    invoice: {
      aggregate: jest.fn().mockResolvedValue(overrides.aggregate ?? mockRevenueResult),
      groupBy: jest.fn().mockResolvedValue(overrides.groupBy ?? mockStatusCounts),
    },
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce(overrides.clientRows ?? mockClientRows)
      .mockResolvedValueOnce(overrides.monthRows ?? mockMonthRows),
  };
}

describe('DashboardService', () => {
  let service: DashboardService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = buildMockPrisma();
    service = new DashboardService(
      mockPrisma as any,
      mockInvoiceReadCache as any,
      mockLoggerValue as any
    );
  });

  describe('totalRevenueTtc', () => {
    it('should return revenue from paid invoices only as fixed-2 string', async () => {
      const result = await service.getSummary(USER_ID);
      expect(result.totalRevenueTtc).toBe('3500.00');
      expect(mockPrisma.invoice.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID, status: InvoiceStatus.paid } })
      );
    });

    it('should return "0.00" when no paid invoices exist', async () => {
      mockPrisma = buildMockPrisma({ aggregate: { _sum: { totalTtc: null } } });
      service = new DashboardService(
        mockPrisma as any,
        mockInvoiceReadCache as any,
        mockLoggerValue as any
      );
      const result = await service.getSummary(USER_ID);
      expect(result.totalRevenueTtc).toBe('0.00');
    });
  });

  describe('counts', () => {
    it('should sum all statuses for invoiceCount', async () => {
      const result = await service.getSummary(USER_ID);
      expect(result.invoiceCount).toBe(7);
    });

    it('should return correct per-status counts', async () => {
      const result = await service.getSummary(USER_ID);
      expect(result.paidCount).toBe(3);
      expect(result.sentCount).toBe(2);
      expect(result.draftCount).toBe(1);
      expect(result.cancelledCount).toBe(1);
    });

    it('should default missing statuses to 0', async () => {
      mockPrisma = buildMockPrisma({
        groupBy: [{ status: InvoiceStatus.draft, _count: { _all: 5 } }],
      });
      service = new DashboardService(
        mockPrisma as any,
        mockInvoiceReadCache as any,
        mockLoggerValue as any
      );
      const result = await service.getSummary(USER_ID);
      expect(result.paidCount).toBe(0);
      expect(result.sentCount).toBe(0);
      expect(result.cancelledCount).toBe(0);
      expect(result.draftCount).toBe(5);
    });
  });

  describe('revenueByClient', () => {
    it('should map client rows to DTO with toFixed(2) amounts', async () => {
      const result = await service.getSummary(USER_ID);
      expect(result.revenueByClient).toEqual([
        { clientId: 'client-1', clientName: 'Sophie Martin', totalTtc: '2000.00' },
        { clientId: 'client-2', clientName: 'Acme SAS', totalTtc: '1500.00' },
      ]);
    });

    it('should return empty array when no paid invoices', async () => {
      mockPrisma = buildMockPrisma({ clientRows: [], monthRows: [] });
      service = new DashboardService(
        mockPrisma as any,
        mockInvoiceReadCache as any,
        mockLoggerValue as any
      );
      const result = await service.getSummary(USER_ID);
      expect(result.revenueByClient).toEqual([]);
    });
  });

  describe('revenueByMonth — December/January Paris boundary', () => {
    it('should map month rows chronologically', async () => {
      const result = await service.getSummary(USER_ID);
      expect(result.revenueByMonth).toEqual([
        { month: '2025-12', totalTtc: '1500.00' },
        { month: '2026-01', totalTtc: '2000.00' },
      ]);
    });

    it('Dec 31 UTC vs Jan 1 Paris: two distinct months must not bleed into each other', async () => {
      // An invoice paid at 2025-12-31 23:30 UTC = 2026-01-01 00:30 Paris (CET+1).
      // The Postgres query handles the AT TIME ZONE conversion; the service must
      // preserve whatever month strings Postgres returns without merging them.
      const boundaryRows = [
        { month: '2025-12', totalTtc: new Prisma.Decimal('500.00') },
        { month: '2026-01', totalTtc: new Prisma.Decimal('800.00') },
      ];
      mockPrisma = buildMockPrisma({ monthRows: boundaryRows });
      service = new DashboardService(
        mockPrisma as any,
        mockInvoiceReadCache as any,
        mockLoggerValue as any
      );
      const result = await service.getSummary(USER_ID);
      expect(result.revenueByMonth).toHaveLength(2);
      expect(result.revenueByMonth[0]).toEqual({ month: '2025-12', totalTtc: '500.00' });
      expect(result.revenueByMonth[1]).toEqual({ month: '2026-01', totalTtc: '800.00' });
    });

    it('should return empty array when no paid invoices', async () => {
      mockPrisma = buildMockPrisma({ clientRows: [], monthRows: [] });
      service = new DashboardService(
        mockPrisma as any,
        mockInvoiceReadCache as any,
        mockLoggerValue as any
      );
      const result = await service.getSummary(USER_ID);
      expect(result.revenueByMonth).toEqual([]);
    });
  });

  describe('parallelism', () => {
    it('should execute all 4 queries via Promise.all', async () => {
      await service.getSummary(USER_ID);
      expect(mockPrisma.invoice.aggregate).toHaveBeenCalledTimes(1);
      expect(mockPrisma.invoice.groupBy).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
    });
  });
});
