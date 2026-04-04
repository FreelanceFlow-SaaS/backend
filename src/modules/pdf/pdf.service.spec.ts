import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Mock pdfmake before the module under test is imported
const mockGetBuffer = jest.fn().mockResolvedValue(Buffer.from('%PDF-mock'));
const mockCreatePdf = jest.fn().mockReturnValue({ getBuffer: mockGetBuffer });

jest.mock('pdfmake', () => ({
  virtualfs: { writeFileSync: jest.fn() },
  addFonts: jest.fn(),
  setUrlAccessPolicy: jest.fn(),
  createPdf: mockCreatePdf,
}));

// Mock fs.readFileSync to avoid touching disk during tests
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn().mockReturnValue(Buffer.from('fake-font')),
}));

import { PdfService } from './pdf.service';

const USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const INVOICE_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

const mockInvoice = {
  id: INVOICE_ID,
  userId: USER_ID,
  invoiceNumber: 'FF-2024-0001',
  status: 'draft',
  issueDate: new Date('2024-01-15'),
  dueDate: new Date('2024-02-15'),
  currency: 'EUR',
  totalHt: new Prisma.Decimal('300.00'),
  totalVat: new Prisma.Decimal('60.00'),
  totalTtc: new Prisma.Decimal('360.00'),
  client: {
    id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    name: 'Sophie Martin',
    company: 'Acme SAS',
    email: 'sophie@acme.fr',
    address: '42 rue du Commerce, 75015 Paris',
  },
  user: {
    id: USER_ID,
    email: 'freelancer@test.fr',
    profile: {
      displayName: 'Jean Freelance',
      legalName: 'Jean Pierre Freelance',
      addressLine1: '10 rue de la République',
      addressLine2: null,
      postalCode: '69001',
      city: 'Lyon',
      country: 'FR',
      vatNumber: 'FR12345678901',
      siret: '12345678901234',
    },
  },
  lines: [
    {
      id: 'line-1',
      lineOrder: 1,
      description: 'Développement backend',
      quantity: new Prisma.Decimal('2.00'),
      unitPriceHt: new Prisma.Decimal('150.00'),
      vatRate: new Prisma.Decimal('0.2000'),
      lineHt: new Prisma.Decimal('300.00'),
      lineVat: new Prisma.Decimal('60.00'),
      lineTtc: new Prisma.Decimal('360.00'),
    },
  ],
};

const mockPrisma = {
  invoice: { findFirst: jest.fn() },
};

describe('PdfService — Unit', () => {
  let service: PdfService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PdfService(mockPrisma as any);
  });

  describe('generateInvoicePdf()', () => {
    it('should return a PDF buffer when invoice exists', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);

      const result = await service.generateInvoicePdf(INVOICE_ID, USER_ID);

      expect(result).toBeInstanceOf(Buffer);
      expect(mockCreatePdf).toHaveBeenCalledWith(
        expect.objectContaining({ defaultStyle: expect.any(Object) })
      );
    });

    it('should scope the query to the user (tenant isolation)', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);

      await service.generateInvoicePdf(INVOICE_ID, USER_ID);

      expect(mockPrisma.invoice.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: INVOICE_ID, userId: USER_ID } })
      );
    });

    it('TENANT ISOLATION: should throw 404 when invoice belongs to another user', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.generateInvoicePdf(INVOICE_ID, 'other-user')).rejects.toThrow(
        NotFoundException
      );
      expect(mockCreatePdf).not.toHaveBeenCalled();
    });

    it('should throw 404 when invoice does not exist', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.generateInvoicePdf('non-existent', USER_ID)).rejects.toThrow(
        NotFoundException
      );
    });

    it('should include invoice lines, client, and user profile in the query', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(mockInvoice);

      await service.generateInvoicePdf(INVOICE_ID, USER_ID);

      const call = mockPrisma.invoice.findFirst.mock.calls[0][0];
      expect(call.include).toMatchObject({
        lines: expect.any(Object),
        client: true,
        user: expect.objectContaining({ include: { profile: true } }),
      });
    });

    it('should work when freelancer has no profile (graceful fallback)', async () => {
      const invoiceNoProfile = {
        ...mockInvoice,
        user: { id: USER_ID, email: 'noprofile@test.fr', profile: null },
      };
      mockPrisma.invoice.findFirst.mockResolvedValue(invoiceNoProfile);

      await expect(service.generateInvoicePdf(INVOICE_ID, USER_ID)).resolves.toBeInstanceOf(Buffer);
    });
  });
});
