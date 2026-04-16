export const INVOICE_EMAIL_ENQUEUE = Symbol('INVOICE_EMAIL_ENQUEUE');

export type SendInvoiceEmailJobPayload = {
  userId: string;
  invoiceId: string;
  to: string[];
  subject: string;
  body: string;
};

export interface InvoiceEmailEnqueue {
  enqueueSendInvoiceEmail(payload: SendInvoiceEmailJobPayload): Promise<string>;
}
