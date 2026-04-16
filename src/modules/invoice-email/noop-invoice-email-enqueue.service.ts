import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  InvoiceEmailEnqueue,
  SendInvoiceEmailJobPayload,
} from './invoice-email-enqueue.token';

@Injectable()
export class NoopInvoiceEmailEnqueueService implements InvoiceEmailEnqueue {
  async enqueueSendInvoiceEmail(_payload: SendInvoiceEmailJobPayload): Promise<string> {
    throw new ServiceUnavailableException(
      "L'envoi par email n'est pas disponible : configurez REDIS_URL (file d'attente BullMQ). Voir README."
    );
  }
}
