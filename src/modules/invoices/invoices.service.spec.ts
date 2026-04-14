import { NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { InvoicesService } from './invoices.service';
import { mockLoggerValue } from '../../common/testing/mock-logger';

const USER_ID = 'user-uuid-1';
const OTHER_USER_ID = 'user-uuid-other';
const CLIENT_ID = 'client-uuid-1';
const SERVICE_ID = 'service-uuid-1';
const INVOICE_ID = 'invoice-uuid-1';

const mockClient = {
  id: CLIENT_ID,
  userId: USER_ID,
  name: 'Sophie Martin',
  email: 'sophie@acme.fr',
  company: 'Acme SAS',
  address: '75015 Paris',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockService = {
  id: SERVICE_ID,
  userId: USER_ID,
  title: 'Développement backend',
  hourlyRateHt: new Prisma.Decimal('150.00'),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockLine = {
  id: 'line-uuid-1',
  invoiceId: INVOICE_ID,
  serviceId: SERVICE_ID,
  lineOrder: 1,
  description: 'Développement backend',
  quantity: new Prisma.Decimal('2.00'),
  unitPriceHt: new Prisma.Decimal('150.00'),
  vatRate: new Prisma.Decimal('0.2000'),
  lineHt: new Prisma.Decimal('300.00'),
  lineVat: new Prisma.Decimal('60.00'),
  lineTtc: new Prisma.Decimal('360.00'),
  createdAt: new Date(),
};

const mockInvoice = {
  id: INVOICE_ID,
  userId: USER_ID,
  clientId: CLIENT_ID,
  invoiceNumber: 'FF-2024-0001',
  status: InvoiceStatus.draft,
  issueDate: new Date('2024-01-15'),
  dueDate: new Date('2024-02-15'),
  currency: 'EUR',
  totalHt: new Prisma.Decimal('300.00'),
  totalVat: new Prisma.Decimal('60.00'),
  totalTtc: new Prisma.Decimal('360.00'),
  createdAt: new Date(),
  updatedAt: new Date(),
  lines: [mockLine],
  client: mockClient,
};

// tx mock reused inside $transaction callbacks
const mockTx = {
  invoice: { create: jest.fn(), update: jest.fn() },
  invoiceLine: { deleteMany: jest.fn() },
  invoiceStatusEvent: { create: jest.fn() },
  $queryRaw: jest.fn().mockResolvedValue([{ seq: 1 }]),
};

const mockPrisma = {
  client: { findFirst: jest.fn() },
  service: { findFirst: jest.fn() },
  invoice: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  invoiceLine: { deleteMany: jest.fn() },
  invoiceStatusEvent: { create: jest.fn() },
  $transaction: jest.fn().mockImplementation((fn: any) => fn(mockTx)),
};

describe('InvoicesService — Unit', () => {
  let service: InvoicesService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Restore default tx mock behaviour after any test that overrides it
    mockTx.$queryRaw.mockResolvedValue([{ seq: 1 }]);
    service = new InvoicesService(mockPrisma as any, mockLoggerValue as any);
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create()', () => {
    const dto = {
      clientId: CLIENT_ID,
      issueDate: '2024-01-15',
      dueDate: '2024-02-15',
      lines: [
        {
          serviceId: SERVICE_ID,
          lineOrder: 1,
          description: 'Développement backend',
          quantity: 2,
          unitPriceHt: 100, // overridden by snapshot
          vatRate: 0.2,
        },
      ],
    };

    it('should create an invoice and return it', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      mockPrisma.service.findFirst.mockResolvedValue(mockService);
      mockTx.invoice.create.mockResolvedValue(mockInvoice);

      const result = await service.create(USER_ID, dto as any);

      expect(result).toEqual(mockInvoice);
      expect(mockPrisma.client.findFirst).toHaveBeenCalledWith({
        where: { id: CLIENT_ID, userId: USER_ID },
      });
      expect(mockTx.invoice.create).toHaveBeenCalled();
    });

    it('SNAPSHOT: should use service.hourlyRateHt as unitPriceHt, not the value in DTO', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      mockPrisma.service.findFirst.mockResolvedValue(mockService); // rate = 150.00
      mockTx.invoice.create.mockResolvedValue(mockInvoice);

      await service.create(USER_ID, dto as any);

      const createCall = mockTx.invoice.create.mock.calls[0][0];
      const lineData = createCall.data.lines.create[0];
      // Snapshot: 150.00 from service, not 100 from DTO
      expect(lineData.unitPriceHt.toString()).toBe('150');
    });

    it('should generate invoice number as FF-YYYY-NNNN using atomic counter', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      mockPrisma.service.findFirst.mockResolvedValue(mockService);
      mockTx.$queryRaw.mockResolvedValue([{ seq: 5 }]); // counter returns seq=5
      mockTx.invoice.create.mockResolvedValue(mockInvoice);

      await service.create(USER_ID, dto as any);

      const createCall = mockTx.invoice.create.mock.calls[0][0];
      const year = new Date().getFullYear();
      expect(createCall.data.invoiceNumber).toBe(`FF-${year}-0005`);
    });

    it('should run counter increment and invoice create in the same transaction', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      mockPrisma.service.findFirst.mockResolvedValue(mockService);
      mockTx.invoice.create.mockResolvedValue(mockInvoice);

      await service.create(USER_ID, dto as any);

      // Both $queryRaw (counter) and invoice.create must be called on the tx, not on prisma directly
      expect(mockTx.$queryRaw).toHaveBeenCalled();
      expect(mockTx.invoice.create).toHaveBeenCalled();
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should throw 404 when client does not belong to user', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(null);

      await expect(service.create(USER_ID, dto as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw 404 when serviceId does not belong to user', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      mockPrisma.service.findFirst.mockResolvedValue(null); // service not found

      await expect(service.create(USER_ID, dto as any)).rejects.toThrow(NotFoundException);
    });

    it('should calculate line totals correctly: lineHt=qty*price, lineVat=lineHt*vatRate', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      mockPrisma.service.findFirst.mockResolvedValue(mockService); // 150.00
      mockTx.invoice.create.mockResolvedValue(mockInvoice);

      await service.create(USER_ID, dto as any);

      const createCall = mockTx.invoice.create.mock.calls[0][0];
      const lineData = createCall.data.lines.create[0];
      // qty=2, rate=150 → lineHt=300, vatRate=0.20 → lineVat=60, lineTtc=360
      expect(lineData.lineHt.toString()).toBe('300');
      // Prisma Decimal preserves precision from operands: 300*0.20 = 60, 300+60 = 360
      expect(parseFloat(lineData.lineVat.toString())).toBe(60);
      expect(parseFloat(lineData.lineTtc.toString())).toBe(360);
    });

    it('should use unitPriceHt from DTO when no serviceId is provided', async () => {
      const dtoNoService = {
        clientId: CLIENT_ID,
        issueDate: '2024-01-15',
        lines: [
          { lineOrder: 1, description: 'Consulting', quantity: 1, unitPriceHt: 200, vatRate: 0.2 },
        ],
      };
      mockPrisma.client.findFirst.mockResolvedValue(mockClient);
      mockTx.invoice.create.mockResolvedValue(mockInvoice);

      await service.create(USER_ID, dtoNoService as any);

      const createCall = mockTx.invoice.create.mock.calls[0][0];
      const lineData = createCall.data.lines.create[0];
      expect(lineData.unitPriceHt.toString()).toBe('200');
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('should return all invoices for the user', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([mockInvoice]);

      const result = await service.findAll(USER_ID);

      expect(result).toEqual([mockInvoice]);
      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID } })
      );
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('should return the invoice when it belongs to the user', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);

      const result = await service.findOne(INVOICE_ID, USER_ID);

      expect(result).toEqual(mockInvoice);
      expect(mockPrisma.invoice.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: INVOICE_ID, userId: USER_ID } })
      );
    });

    it('TENANT ISOLATION: should throw 404 when invoice belongs to another user', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.findOne(INVOICE_ID, OTHER_USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw 404 when invoice does not exist', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.findOne('non-existent', USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('should update metadata on a draft invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);
      const updated = { ...mockInvoice, currency: 'USD' };
      mockPrisma.invoice.update.mockResolvedValue(updated);

      const result = await service.update(INVOICE_ID, USER_ID, { currency: 'USD' });

      expect(result.currency).toBe('USD');
    });

    it('should throw 400 when invoice is not in draft status', async () => {
      const sentInvoice = { ...mockInvoice, status: InvoiceStatus.sent };
      mockPrisma.invoice.findFirst.mockResolvedValue(sentInvoice);

      await expect(service.update(INVOICE_ID, USER_ID, { currency: 'USD' })).rejects.toThrow(
        BadRequestException
      );
    });

    it('TENANT ISOLATION: should throw 404 when invoice belongs to another user', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.update(INVOICE_ID, OTHER_USER_ID, {})).rejects.toThrow(
        NotFoundException
      );
    });
  });

  // ─── updateLines ─────────────────────────────────────────────────────────────

  describe('updateLines()', () => {
    const linesDto = {
      lines: [
        { lineOrder: 1, description: 'New line', quantity: 3, unitPriceHt: 100, vatRate: 0.2 },
      ],
    };

    it('should replace lines on a draft invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);
      const txFn = jest
        .fn()
        .mockResolvedValue({ ...mockInvoice, totalHt: new Prisma.Decimal('300') });
      mockPrisma.$transaction.mockImplementation((fn: any) =>
        fn({ invoiceLine: { deleteMany: jest.fn() }, invoice: { update: txFn } })
      );

      await service.updateLines(INVOICE_ID, USER_ID, linesDto as any);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should throw 400 when invoice is not in draft status', async () => {
      const sentInvoice = { ...mockInvoice, status: InvoiceStatus.sent };
      mockPrisma.invoice.findFirst.mockResolvedValue(sentInvoice);

      await expect(service.updateLines(INVOICE_ID, USER_ID, linesDto as any)).rejects.toThrow(
        BadRequestException
      );
    });
  });

  // ─── updateStatus ────────────────────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('should transition draft → sent', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);
      const sentInvoice = { ...mockInvoice, status: InvoiceStatus.sent };
      const txInvoiceUpdate = jest.fn().mockResolvedValue(sentInvoice);
      const txEventCreate = jest.fn().mockResolvedValue({});
      mockPrisma.$transaction.mockImplementation((fn: any) =>
        fn({ invoice: { update: txInvoiceUpdate }, invoiceStatusEvent: { create: txEventCreate } })
      );

      const result = await service.updateStatus(INVOICE_ID, USER_ID, {
        status: InvoiceStatus.sent,
      });

      expect(result.status).toBe(InvoiceStatus.sent);
      expect(txEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromStatus: InvoiceStatus.draft,
            toStatus: InvoiceStatus.sent,
          }),
        })
      );
    });

    it('should transition sent → paid', async () => {
      const sentInvoice = { ...mockInvoice, status: InvoiceStatus.sent };
      mockPrisma.invoice.findFirst.mockResolvedValue(sentInvoice);
      const paidInvoice = { ...mockInvoice, status: InvoiceStatus.paid };
      const txInvoiceUpdate = jest.fn().mockResolvedValue(paidInvoice);
      mockPrisma.$transaction.mockImplementation((fn: any) =>
        fn({ invoice: { update: txInvoiceUpdate }, invoiceStatusEvent: { create: jest.fn() } })
      );

      const result = await service.updateStatus(INVOICE_ID, USER_ID, {
        status: InvoiceStatus.paid,
      });

      expect(result.status).toBe(InvoiceStatus.paid);
    });

    it('should transition draft → cancelled', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);
      const cancelledInvoice = { ...mockInvoice, status: InvoiceStatus.cancelled };
      const txInvoiceUpdate = jest.fn().mockResolvedValue(cancelledInvoice);
      mockPrisma.$transaction.mockImplementation((fn: any) =>
        fn({ invoice: { update: txInvoiceUpdate }, invoiceStatusEvent: { create: jest.fn() } })
      );

      const result = await service.updateStatus(INVOICE_ID, USER_ID, {
        status: InvoiceStatus.cancelled,
      });

      expect(result.status).toBe(InvoiceStatus.cancelled);
    });

    it('should throw 400 for invalid transition: draft → paid', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);

      await expect(
        service.updateStatus(INVOICE_ID, USER_ID, { status: InvoiceStatus.paid })
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw 400 for invalid transition: paid → anything', async () => {
      const paidInvoice = { ...mockInvoice, status: InvoiceStatus.paid };
      mockPrisma.invoice.findFirst.mockResolvedValue(paidInvoice);

      await expect(
        service.updateStatus(INVOICE_ID, USER_ID, { status: InvoiceStatus.cancelled })
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw 400 for invalid transition: cancelled → anything', async () => {
      const cancelledInvoice = { ...mockInvoice, status: InvoiceStatus.cancelled };
      mockPrisma.invoice.findFirst.mockResolvedValue(cancelledInvoice);

      await expect(
        service.updateStatus(INVOICE_ID, USER_ID, { status: InvoiceStatus.sent })
      ).rejects.toThrow(BadRequestException);
    });

    it('TENANT ISOLATION: should throw 404 when invoice belongs to another user', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStatus(INVOICE_ID, OTHER_USER_ID, { status: InvoiceStatus.sent })
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('should delete a draft invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);
      mockPrisma.invoice.delete.mockResolvedValue(mockInvoice);

      await service.remove(INVOICE_ID, USER_ID);

      expect(mockPrisma.invoice.delete).toHaveBeenCalledWith({ where: { id: INVOICE_ID } });
    });

    it('should delete a cancelled invoice', async () => {
      const cancelledInvoice = { ...mockInvoice, status: InvoiceStatus.cancelled };
      mockPrisma.invoice.findFirst.mockResolvedValue(cancelledInvoice);
      mockPrisma.invoice.delete.mockResolvedValue(cancelledInvoice);

      await service.remove(INVOICE_ID, USER_ID);

      expect(mockPrisma.invoice.delete).toHaveBeenCalledWith({ where: { id: INVOICE_ID } });
    });

    it('should throw 400 when trying to delete a sent invoice', async () => {
      const sentInvoice = { ...mockInvoice, status: InvoiceStatus.sent };
      mockPrisma.invoice.findFirst.mockResolvedValue(sentInvoice);

      await expect(service.remove(INVOICE_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('should throw 400 when trying to delete a paid invoice', async () => {
      const paidInvoice = { ...mockInvoice, status: InvoiceStatus.paid };
      mockPrisma.invoice.findFirst.mockResolvedValue(paidInvoice);

      await expect(service.remove(INVOICE_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('TENANT ISOLATION: should throw 404 when invoice belongs to another user', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.remove(INVOICE_ID, OTHER_USER_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
