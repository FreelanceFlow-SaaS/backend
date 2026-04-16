import { Job, UnrecoverableError } from 'bullmq';
import { InvoiceStatus } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { SendInvoiceEmailProcessor } from './send-invoice-email.processor';
import type { SendInvoiceEmailJobPayload } from './invoice-email-enqueue.token';

describe('SendInvoiceEmailProcessor', () => {
  const payload: SendInvoiceEmailJobPayload = {
    userId: 'user-1',
    invoiceId: 'inv-1',
    to: ['client@test.fr'],
    subject: 'Facture',
    body: 'Bonjour',
  };

  function makeJob(
    data: SendInvoiceEmailJobPayload,
    attemptsMade = 0
  ): Job<SendInvoiceEmailJobPayload> {
    return { id: 'j1', data, attemptsMade } as Job<SendInvoiceEmailJobPayload>;
  }

  it('throws UnrecoverableError when invoice is cancelled', async () => {
    const prisma = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inv-1',
          status: InvoiceStatus.cancelled,
          invoiceNumber: 'FF-1',
        }),
      },
    };
    const pdf = { generateInvoicePdf: jest.fn() };
    const mail = { isConfigured: () => true, sendInvoiceWithPdf: jest.fn() };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as PinoLogger;
    const proc = new SendInvoiceEmailProcessor(prisma as any, pdf as any, mail as any, logger);
    await expect(proc.process(makeJob(payload))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(pdf.generateInvoicePdf).not.toHaveBeenCalled();
  });

  it('calls mail after PDF when invoice is valid', async () => {
    const prisma = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inv-1',
          status: InvoiceStatus.sent,
          invoiceNumber: 'FF-1',
        }),
      },
    };
    const pdfBuf = Buffer.from('%PDF-1.4');
    const pdf = { generateInvoicePdf: jest.fn().mockResolvedValue(pdfBuf) };
    const mail = {
      isConfigured: () => true,
      sendInvoiceWithPdf: jest.fn().mockResolvedValue(undefined),
    };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as PinoLogger;
    const proc = new SendInvoiceEmailProcessor(prisma as any, pdf as any, mail as any, logger);
    await proc.process(makeJob(payload));
    expect(pdf.generateInvoicePdf).toHaveBeenCalledWith('inv-1', 'user-1');
    expect(mail.sendInvoiceWithPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        to: payload.to,
        subject: payload.subject,
        text: payload.body,
        pdf: pdfBuf,
      })
    );
  });

  it('throws UnrecoverableError on permanent SMTP response', async () => {
    const prisma = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inv-1',
          status: InvoiceStatus.draft,
          invoiceNumber: 'FF-1',
        }),
      },
    };
    const pdf = { generateInvoicePdf: jest.fn().mockResolvedValue(Buffer.from('x')) };
    const err = Object.assign(new Error('550 mailbox unavailable'), { responseCode: 550 });
    const mail = { isConfigured: () => true, sendInvoiceWithPdf: jest.fn().mockRejectedValue(err) };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as PinoLogger;
    const proc = new SendInvoiceEmailProcessor(prisma as any, pdf as any, mail as any, logger);
    await expect(proc.process(makeJob(payload))).rejects.toBeInstanceOf(UnrecoverableError);
  });
});
