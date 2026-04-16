import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { PdfModule } from '../pdf/pdf.module';
import { MailModule } from '../mail/mail.module';
import { INVOICE_EMAIL_ENQUEUE } from './invoice-email-enqueue.token';
import { BullInvoiceEmailEnqueueService } from './bull-invoice-email-enqueue.service';
import { NoopInvoiceEmailEnqueueService } from './noop-invoice-email-enqueue.service';
import { SendInvoiceEmailProcessor } from './send-invoice-email.processor';

const QUEUE_NAME = 'send-invoice-email';
const redisUrl = process.env.REDIS_URL?.trim();

@Module({
  imports: [
    PrismaModule,
    MailModule,
    ...(redisUrl
      ? [
          BullModule.forRoot({
            connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
          }),
          BullModule.registerQueue({ name: QUEUE_NAME }),
          PdfModule,
        ]
      : []),
  ],
  providers: [
    ...(redisUrl ? [BullInvoiceEmailEnqueueService, SendInvoiceEmailProcessor] : []),
    ...(redisUrl
      ? [
          {
            provide: INVOICE_EMAIL_ENQUEUE,
            useExisting: BullInvoiceEmailEnqueueService,
          },
        ]
      : [
          NoopInvoiceEmailEnqueueService,
          {
            provide: INVOICE_EMAIL_ENQUEUE,
            useExisting: NoopInvoiceEmailEnqueueService,
          },
        ]),
  ],
  exports: [INVOICE_EMAIL_ENQUEUE],
})
export class InvoiceEmailModule {}
