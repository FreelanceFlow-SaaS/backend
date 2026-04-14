import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateInvoiceLineDto } from './dto/create-invoice-line.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { UpdateInvoiceLinesDto } from './dto/update-invoice-lines.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';

// Only these transitions are allowed
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: [InvoiceStatus.sent, InvoiceStatus.cancelled],
  sent: [InvoiceStatus.paid, InvoiceStatus.cancelled],
  paid: [],
  cancelled: [],
};

const INVOICE_INCLUDE = {
  lines: { orderBy: { lineOrder: 'asc' as const } },
  client: true,
};

// ─── CSV helpers ──────────────────────────────────────────────────────────────

const STATUS_FR: Record<string, string> = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  paid: 'Payée',
  cancelled: 'Annulée',
};

// Replaces decimal point with comma (French locale: 1250,00).
function decimalFr(value: string): string {
  return value.replace('.', ',');
}

// Returns dd/MM/yyyy without relying on Node ICU locale.
function formatDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

// Quotes a CSV field if it contains the separator, quotes, or newlines.
function csvField(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(InvoicesService.name)
    private readonly logger: PinoLogger
  ) {}

  async create(userId: string, dto: CreateInvoiceDto) {
    const client = await this.prisma.client.findFirst({ where: { id: dto.clientId, userId } });
    if (!client) throw new NotFoundException('Client introuvable');

    // Build lines outside the transaction (may do service lookups)
    const linesData = await this.buildLinesData(userId, dto.lines);
    const { totalHt, totalVat, totalTtc } = this.sumLines(linesData);

    return this.prisma.$transaction(async (tx) => {
      // Atomic counter increment — safe under concurrent requests for the same user
      const invoiceNumber = await this.generateInvoiceNumber(userId, tx);

      const invoice = await tx.invoice.create({
        data: {
          userId,
          clientId: dto.clientId,
          invoiceNumber,
          issueDate: new Date(dto.issueDate),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          currency: dto.currency ?? 'EUR',
          totalHt,
          totalVat,
          totalTtc,
          lines: { create: linesData },
          events: {
            create: { fromStatus: null, toStatus: InvoiceStatus.draft },
          },
        },
        include: INVOICE_INCLUDE,
      });
      this.logger.info(
        {
          event: 'invoice_created',
          userId,
          invoiceId: invoice.id,
          invoiceNumber,
          totalTtc: totalTtc.toFixed(2),
        },
        'invoice created'
      );
      return invoice;
    });
  }

  async findAll(userId: string) {
    return this.prisma.invoice.findMany({
      where: { userId },
      include: INVOICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, userId },
      include: INVOICE_INCLUDE,
    });
    if (!invoice) throw new NotFoundException('Facture introuvable');
    return invoice;
  }

  async update(id: string, userId: string, dto: UpdateInvoiceDto) {
    const invoice = await this.findOne(id, userId);
    if (invoice.status !== InvoiceStatus.draft) {
      throw new BadRequestException('Seules les factures en brouillon peuvent être modifiées');
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        ...(dto.issueDate && { issueDate: new Date(dto.issueDate) }),
        ...(dto.dueDate !== undefined && {
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        }),
        ...(dto.currency && { currency: dto.currency }),
      },
      include: INVOICE_INCLUDE,
    });
    this.logger.info({ event: 'invoice_updated', userId, invoiceId: id }, 'invoice updated');
    return updated;
  }

  async updateLines(id: string, userId: string, dto: UpdateInvoiceLinesDto) {
    const invoice = await this.findOne(id, userId);
    if (invoice.status !== InvoiceStatus.draft) {
      throw new BadRequestException('Seules les factures en brouillon peuvent être modifiées');
    }

    const linesData = await this.buildLinesData(userId, dto.lines);
    const { totalHt, totalVat, totalTtc } = this.sumLines(linesData);

    return this.prisma.$transaction(async (tx) => {
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      const updated = await tx.invoice.update({
        where: { id },
        data: {
          totalHt,
          totalVat,
          totalTtc,
          lines: { create: linesData },
        },
        include: INVOICE_INCLUDE,
      });
      this.logger.info(
        { event: 'invoice_lines_updated', userId, invoiceId: id, lineCount: linesData.length },
        'invoice lines updated'
      );
      return updated;
    });
  }

  async updateStatus(id: string, userId: string, dto: UpdateInvoiceStatusDto) {
    const invoice = await this.findOne(id, userId);
    const allowed = ALLOWED_TRANSITIONS[invoice.status];

    if (!allowed.includes(dto.status)) {
      this.logger.warn(
        {
          event: 'invoice_status_transition_rejected',
          userId,
          invoiceId: id,
          fromStatus: invoice.status,
          toStatus: dto.status,
        },
        'invalid invoice status transition'
      );
      throw new BadRequestException(
        `Transition de statut invalide: ${invoice.status} → ${dto.status}`
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id },
        data: {
          status: dto.status,
          // Record the exact moment payment is confirmed — used as the
          // authoritative revenue date in dashboard calculations.
          // Guard: only set paidAt on the first paid transition; never overwrite.
          ...(dto.status === InvoiceStatus.paid &&
            invoice.status !== InvoiceStatus.paid && { paidAt: new Date() }),
        },
        include: INVOICE_INCLUDE,
      });
      await tx.invoiceStatusEvent.create({
        data: { invoiceId: id, fromStatus: invoice.status, toStatus: dto.status },
      });
      this.logger.info(
        {
          event: 'invoice_status_changed',
          userId,
          invoiceId: id,
          fromStatus: invoice.status,
          toStatus: dto.status,
        },
        'invoice status changed'
      );
      return updated;
    });
  }

  async remove(id: string, userId: string) {
    const invoice = await this.findOne(id, userId);
    if (invoice.status !== InvoiceStatus.draft && invoice.status !== InvoiceStatus.cancelled) {
      throw new BadRequestException(
        'Seules les factures en brouillon ou annulées peuvent être supprimées'
      );
    }
    await this.prisma.invoice.delete({ where: { id } });
    this.logger.info(
      { event: 'invoice_deleted', userId, invoiceId: id, status: invoice.status },
      'invoice deleted'
    );
  }

  async exportCsv(userId: string): Promise<string> {
    const invoices = await this.prisma.invoice.findMany({
      where: { userId },
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });

    const headers = [
      'Numéro',
      'Client',
      'Statut',
      "Date d'émission",
      "Date d'échéance",
      'Total HT',
      'Total TVA',
      'Total TTC',
      'Devise',
      'Date de création',
    ];

    const rows = invoices.map((inv) => [
      inv.invoiceNumber,
      inv.client?.name ?? 'Client supprimé',
      STATUS_FR[inv.status] ?? inv.status,
      formatDate(inv.issueDate),
      inv.dueDate ? formatDate(inv.dueDate) : '',
      decimalFr(inv.totalHt.toFixed(2)),
      decimalFr(inv.totalVat.toFixed(2)),
      decimalFr(inv.totalTtc.toFixed(2)),
      inv.currency,
      formatDate(inv.createdAt),
    ]);

    this.logger.info(
      { event: 'invoices_exported', userId, count: invoices.length },
      'invoices CSV exported'
    );
    return [headers, ...rows].map((row) => row.map(csvField).join(';')).join('\r\n');
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  // Atomically increments the per-user counter for the current year.
  // Uses INSERT ... ON CONFLICT DO UPDATE ... RETURNING so the entire
  // operation is a single round-trip with no TOCTOU gap.
  // When the year rolls over the seq resets to 1 automatically.
  private async generateInvoiceNumber(
    userId: string,
    tx: Prisma.TransactionClient
  ): Promise<string> {
    const year = new Date().getFullYear();

    const rows = await tx.$queryRaw<Array<{ seq: number }>>`
      INSERT INTO invoice_counters (user_id, year, seq)
      VALUES (${userId}::uuid, ${year}, 1)
      ON CONFLICT (user_id) DO UPDATE
        SET seq  = CASE
                     WHEN invoice_counters.year = ${year} THEN invoice_counters.seq + 1
                     ELSE 1
                   END,
            year = ${year}
      RETURNING seq
    `;

    const seq = String(rows[0].seq).padStart(4, '0');
    return `FF-${year}-${seq}`;
  }

  private async buildLinesData(userId: string, lines: CreateInvoiceLineDto[]): Promise<any[]> {
    const result: any[] = [];

    for (const line of lines) {
      let unitPriceHt = new Prisma.Decimal(line.unitPriceHt);

      if (line.serviceId) {
        // Snapshot: copy the service's current rate at creation time
        const service = await this.prisma.service.findFirst({
          where: { id: line.serviceId, userId },
        });
        if (!service) {
          throw new NotFoundException(`Prestation introuvable: ${line.serviceId}`);
        }
        unitPriceHt = service.hourlyRateHt;
      }

      const quantity = new Prisma.Decimal(line.quantity);
      const vatRate = new Prisma.Decimal(line.vatRate);
      const lineHt = quantity.mul(unitPriceHt);
      const lineVat = lineHt.mul(vatRate);
      const lineTtc = lineHt.add(lineVat);

      result.push({
        serviceId: line.serviceId ?? null,
        lineOrder: line.lineOrder,
        description: line.description,
        quantity,
        unitPriceHt,
        vatRate,
        lineHt,
        lineVat,
        lineTtc,
      });
    }

    return result;
  }

  private sumLines(lines: any[]) {
    let totalHt = new Prisma.Decimal(0);
    let totalVat = new Prisma.Decimal(0);
    let totalTtc = new Prisma.Decimal(0);

    for (const l of lines) {
      totalHt = totalHt.add(l.lineHt);
      totalVat = totalVat.add(l.lineVat);
      totalTtc = totalTtc.add(l.lineTtc);
    }

    return { totalHt, totalVat, totalTtc };
  }
}
