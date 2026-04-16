import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type {
  InvoiceEmailEnqueue,
  SendInvoiceEmailJobPayload,
} from './invoice-email-enqueue.token';

const QUEUE_NAME = 'send-invoice-email';

@Injectable()
export class BullInvoiceEmailEnqueueService implements InvoiceEmailEnqueue {
  constructor(@InjectQueue(QUEUE_NAME) private readonly queue: Queue<SendInvoiceEmailJobPayload>) {}

  async enqueueSendInvoiceEmail(payload: SendInvoiceEmailJobPayload): Promise<string> {
    const job = await this.queue.add(QUEUE_NAME, payload, {
      attempts: 2,
      backoff: { type: 'fixed', delay: 12_000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 80 },
    });
    return String(job.id);
  }
}
