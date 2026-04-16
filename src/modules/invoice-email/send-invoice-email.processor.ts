import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';
import { MailService } from '../mail/mail.service';
import type { SendInvoiceEmailJobPayload } from './invoice-email-enqueue.token';

const QUEUE_NAME = 'send-invoice-email';

function isTransientSmtpError(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException & { code?: string; responseCode?: number };
  const transientCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ESOCKET', 'EPIPE'];
  if (e?.code && transientCodes.includes(e.code)) return true;
  if (typeof e?.responseCode === 'number' && e.responseCode >= 400 && e.responseCode < 500) {
    return true;
  }
  return false;
}

function isPermanentSmtpError(err: unknown): boolean {
  const e = err as { responseCode?: number; message?: string };
  if (typeof e?.responseCode === 'number' && e.responseCode >= 550 && e.responseCode < 560) {
    return true;
  }
  const msg = (e?.message ?? '').toLowerCase();
  if (
    msg.includes('mailbox unavailable') ||
    msg.includes('user unknown') ||
    msg.includes('invalid')
  ) {
    return true;
  }
  return false;
}

@Injectable()
@Processor(QUEUE_NAME, { concurrency: Number(process.env.EMAIL_QUEUE_CONCURRENCY || '2') })
export class SendInvoiceEmailProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly mailService: MailService,
    @InjectPinoLogger(SendInvoiceEmailProcessor.name)
    private readonly logger: PinoLogger
  ) {
    super();
  }

  async process(job: Job<SendInvoiceEmailJobPayload>): Promise<void> {
    const { userId, invoiceId, to, subject, body } = job.data;

    if (!this.mailService.isConfigured()) {
      throw new UnrecoverableError(
        'Configuration SMTP incomplète (SMTP_HOST, etc.). Corrigez la configuration serveur.'
      );
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, userId },
      select: { id: true, status: true, invoiceNumber: true },
    });

    if (!invoice) {
      throw new UnrecoverableError('Facture introuvable ou non autorisée.');
    }

    if (invoice.status === InvoiceStatus.cancelled) {
      throw new UnrecoverableError('Envoi impossible : la facture est annulée.');
    }

    const pdf = await this.pdfService.generateInvoicePdf(invoiceId, userId);
    const maxBytes = 15 * 1024 * 1024;
    if (pdf.length > maxBytes) {
      throw new UnrecoverableError('PDF trop volumineux pour être envoyé par email.');
    }

    try {
      await this.mailService.sendInvoiceWithPdf({
        to,
        subject,
        text: body,
        pdf,
        pdfFileName: `${invoice.invoiceNumber.replace(/[^\w.-]+/g, '_')}.pdf`,
      });
    } catch (err) {
      if (isPermanentSmtpError(err)) {
        throw new UnrecoverableError(
          "L'envoi a échoué : adresse invalide ou refus définitif du serveur de messagerie. La facture n'a pas été livrée."
        );
      }
      if (isTransientSmtpError(err)) {
        throw err;
      }
      throw err;
    }

    this.logger.info(
      {
        'event.action': 'invoice_email_job_completed',
        invoiceId,
        jobId: job.id,
        attempt: job.attemptsMade + 1,
      },
      'invoice email job completed'
    );
  }
}
