import { Prisma } from '@prisma/client';
import { parseInvoicePayload, stringifyInvoicePayload } from './invoice-payload-json';

describe('invoice-payload-json', () => {
  it('round-trips Decimal and Date fields', () => {
    const payload = {
      totalHt: new Prisma.Decimal('10.50'),
      issueDate: new Date('2024-06-01T12:00:00.000Z'),
      nested: { lineTtc: new Prisma.Decimal('99.99') },
    };
    const raw = stringifyInvoicePayload(payload);
    const back = parseInvoicePayload<typeof payload>(raw);
    expect(back.totalHt).toBeInstanceOf(Prisma.Decimal);
    expect(back.totalHt.toString()).toBe('10.5');
    expect(back.issueDate).toBeInstanceOf(Date);
    expect(back.nested.lineTtc.toString()).toBe('99.99');
  });
});
