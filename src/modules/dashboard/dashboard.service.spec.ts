import { DashboardService } from './dashboard.service';
import { mockLoggerValue } from '../../common/testing/mock-logger';
import { InvoiceStatus, Prisma } from '@prisma/client';

const USER_ID = 'user-uuid-1';

// Fixtures: 3 paid, 2 sent, 1 draft, 1 cancelled
const mockStatusCounts = [
  { status: InvoiceStatus.paid, _count: { _all: 3 } },
  { status: InvoiceStatus.sent, _count: { _all: 2 } },
  { status: InvoiceStatus.draft, _count: { _all: 1 } },
  { status: InvoiceStatus.cancelled, _count: { _all: 1 } },
];

// Revenue: only paid invoices — 1000 + 2000 + 500 = 3500 TTC
const mockRevenueResult = {
  _sum: { totalTtc: new Prisma.Decimal('3500.00') },
};

const mockPrisma = {
  invoice: {
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
};

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.invoice.aggregate.mockResolvedValue(mockRevenueResult);
    mockPrisma.invoice.groupBy.mockResolvedValue(mockStatusCounts);
    service = new DashboardService(mockPrisma as any, mockLoggerValue as any);
  });

  describe('getSummary()', () => {
    it('should return total revenue from paid invoices only', async () => {
      const result = await service.getSummary(USER_ID);

      expect(result.totalRevenueTtc).toBe('3500.00');

      // aggregate is scoped to paid status only
      expect(mockPrisma.invoice.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, status: InvoiceStatus.paid },
          _sum: { totalTtc: true },
        })
      );
    });

    it('should return total invoice count across all statuses', async () => {
      const result = await service.getSummary(USER_ID);

      // 3 + 2 + 1 + 1 = 7
      expect(result.invoiceCount).toBe(7);
    });

    it('should return correct count per status', async () => {
      const result = await service.getSummary(USER_ID);

      expect(result.paidCount).toBe(3);
      expect(result.sentCount).toBe(2);
      expect(result.draftCount).toBe(1);
      expect(result.cancelledCount).toBe(1);
    });

    it('should return "0" revenue when no paid invoices exist', async () => {
      mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalTtc: null } });
      mockPrisma.invoice.groupBy.mockResolvedValue([
        { status: InvoiceStatus.draft, _count: { _all: 2 } },
      ]);

      const result = await service.getSummary(USER_ID);

      expect(result.totalRevenueTtc).toBe('0.00');
      expect(result.paidCount).toBe(0);
      expect(result.sentCount).toBe(0);
    });

    it('should return zero counts for missing statuses', async () => {
      // Only draft invoices exist
      mockPrisma.invoice.groupBy.mockResolvedValue([
        { status: InvoiceStatus.draft, _count: { _all: 5 } },
      ]);

      const result = await service.getSummary(USER_ID);

      expect(result.paidCount).toBe(0);
      expect(result.sentCount).toBe(0);
      expect(result.cancelledCount).toBe(0);
      expect(result.draftCount).toBe(5);
      expect(result.invoiceCount).toBe(5);
    });

    it('should execute aggregate and groupBy in parallel', async () => {
      await service.getSummary(USER_ID);

      // Both queries must be called (Promise.all)
      expect(mockPrisma.invoice.aggregate).toHaveBeenCalledTimes(1);
      expect(mockPrisma.invoice.groupBy).toHaveBeenCalledTimes(1);
    });
  });
});
