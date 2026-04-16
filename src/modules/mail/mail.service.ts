import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

export type SendInvoiceMailInput = {
  to: string[];
  subject: string;
  text: string;
  pdf: Buffer;
  pdfFileName: string;
};

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectPinoLogger(MailService.name)
    private readonly logger: PinoLogger
  ) {}

  isConfigured(): boolean {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    return Boolean(host);
  }

  private getTransporter(): nodemailer.Transporter<SMTPTransport.SentMessageInfo> {
    if (this.transporter) return this.transporter;
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    if (!host) {
      throw new Error('SMTP non configuré');
    }
    const port = Number(this.config.get<string>('SMTP_PORT') || '587');
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS')?.trim();
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
    return this.transporter;
  }

  private getFromAddress(): string {
    const from = this.config.get<string>('SMTP_FROM')?.trim();
    const fallback = this.config.get<string>('SMTP_USER')?.trim();
    return from || fallback || 'noreply@localhost';
  }

  /**
   * Sends invoice email with PDF. Does not log subject/body/recipients (NFR-O1).
   */
  async sendInvoiceWithPdf(input: SendInvoiceMailInput): Promise<void> {
    const transport = this.getTransporter();
    await transport.sendMail({
      from: this.getFromAddress(),
      to: input.to,
      subject: input.subject,
      text: input.text,
      attachments: [
        {
          filename: input.pdfFileName,
          content: input.pdf,
          contentType: 'application/pdf',
        },
      ],
    });
    this.logger.info(
      {
        'event.action': 'invoice_email_smtp_accepted',
        recipientCount: input.to.length,
        subjectLength: input.subject.length,
        pdfBytes: input.pdf.length,
      },
      'invoice email handed to SMTP transport'
    );
  }
}
