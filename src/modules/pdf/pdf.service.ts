import { Injectable, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';

// pdfmake is a CommonJS singleton — load once at module level
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmake = require('pdfmake');

const FONT_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  'node_modules',
  'pdfmake',
  'build',
  'fonts',
  'Roboto'
);

function initFonts() {
  pdfmake.virtualfs.writeFileSync(
    'Roboto-Regular.ttf',
    readFileSync(join(FONT_DIR, 'Roboto-Regular.ttf'))
  );
  pdfmake.virtualfs.writeFileSync(
    'Roboto-Medium.ttf',
    readFileSync(join(FONT_DIR, 'Roboto-Medium.ttf'))
  );
  pdfmake.virtualfs.writeFileSync(
    'Roboto-Italic.ttf',
    readFileSync(join(FONT_DIR, 'Roboto-Italic.ttf'))
  );
  pdfmake.virtualfs.writeFileSync(
    'Roboto-MediumItalic.ttf',
    readFileSync(join(FONT_DIR, 'Roboto-MediumItalic.ttf'))
  );
  pdfmake.addFonts({
    Roboto: {
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Medium.ttf',
      italics: 'Roboto-Italic.ttf',
      bolditalics: 'Roboto-MediumItalic.ttf',
    },
  });
  pdfmake.setUrlAccessPolicy(() => false);
}

initFonts();

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  paid: 'Payée',
  cancelled: 'Annulée',
};

@Injectable()
export class PdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generateInvoicePdf(invoiceId: string, userId: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, userId },
      include: {
        lines: { orderBy: { lineOrder: 'asc' } },
        client: true,
        user: { include: { profile: true } },
      },
    });

    if (!invoice) throw new NotFoundException('Facture introuvable');

    const docDefinition = this.buildDocDefinition(invoice);
    return pdfmake.createPdf(docDefinition).getBuffer();
  }

  private buildDocDefinition(invoice: any) {
    const profile = invoice.user?.profile;
    const freelancerName = profile?.displayName ?? invoice.user?.email ?? '';
    const freelancerAddress = profile
      ? [
          profile.addressLine1,
          profile.addressLine2,
          `${profile.postalCode} ${profile.city}`,
          profile.country,
        ]
          .filter(Boolean)
          .join('\n')
      : '';

    const vatNumber = profile?.vatNumber
      ? `N° TVA: ${profile.vatNumber}`
      : 'Auto-entrepreneur (TVA non applicable)';
    const siret = profile?.siret ? `SIRET: ${profile.siret}` : '';

    const issueDate = new Date(invoice.issueDate).toLocaleDateString('fr-FR');
    const dueDate = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString('fr-FR')
      : 'À réception';

    const lineRows = invoice.lines.map((line: any) => [
      { text: line.description },
      { text: Number(line.quantity).toFixed(2), alignment: 'right' },
      { text: `${Number(line.unitPriceHt).toFixed(2)} €`, alignment: 'right' },
      { text: `${(Number(line.vatRate) * 100).toFixed(0)} %`, alignment: 'right' },
      { text: `${Number(line.lineHt).toFixed(2)} €`, alignment: 'right' },
      { text: `${Number(line.lineVat).toFixed(2)} €`, alignment: 'right' },
      { text: `${Number(line.lineTtc).toFixed(2)} €`, alignment: 'right' },
    ]);

    return {
      defaultStyle: { font: 'Roboto', fontSize: 10 },
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60],
      content: [
        // ── Header: freelancer info + invoice title ──
        {
          columns: [
            {
              stack: [
                { text: freelancerName, style: 'header' },
                { text: freelancerAddress, style: 'subtext' },
                siret ? { text: siret, style: 'subtext' } : {},
                { text: vatNumber, style: 'subtext' },
              ],
            },
            {
              stack: [
                { text: 'FACTURE', style: 'invoiceTitle', alignment: 'right' },
                { text: invoice.invoiceNumber, style: 'invoiceNumber', alignment: 'right' },
                {
                  text: `Statut: ${STATUS_LABELS[invoice.status] ?? invoice.status}`,
                  alignment: 'right',
                  color: '#666',
                },
              ],
            },
          ],
          marginBottom: 20,
        },

        // ── Dates ──
        {
          columns: [
            { text: `Date d'émission: ${issueDate}` },
            { text: `Date d'échéance: ${dueDate}`, alignment: 'right' },
          ],
          marginBottom: 20,
        },

        // ── Client block ──
        {
          stack: [
            { text: 'Facturer à', style: 'sectionTitle' },
            { text: invoice.client.name, bold: true },
            { text: invoice.client.company },
            { text: invoice.client.email, color: '#555' },
            {
              text: [
                invoice.client.addressLine1,
                `${invoice.client.zipCode} ${invoice.client.city}`,
                invoice.client.country,
              ].join('\n'),
              color: '#555',
            },
          ],
          marginBottom: 24,
        },

        // ── Line items table ──
        {
          table: {
            headerRows: 1,
            widths: ['*', 50, 60, 40, 60, 55, 60],
            body: [
              [
                { text: 'Description', style: 'tableHeader' },
                { text: 'Qté', style: 'tableHeader', alignment: 'right' },
                { text: 'P.U. HT', style: 'tableHeader', alignment: 'right' },
                { text: 'TVA', style: 'tableHeader', alignment: 'right' },
                { text: 'Total HT', style: 'tableHeader', alignment: 'right' },
                { text: 'TVA (€)', style: 'tableHeader', alignment: 'right' },
                { text: 'Total TTC', style: 'tableHeader', alignment: 'right' },
              ],
              ...lineRows,
            ],
          },
          layout: 'lightHorizontalLines',
          marginBottom: 16,
        },

        // ── Totals ──
        {
          columns: [
            { text: '' },
            {
              table: {
                widths: [80, 80],
                body: [
                  [
                    { text: 'Total HT', alignment: 'right' },
                    { text: `${Number(invoice.totalHt).toFixed(2)} €`, alignment: 'right' },
                  ],
                  [
                    { text: 'Total TVA', alignment: 'right' },
                    { text: `${Number(invoice.totalVat).toFixed(2)} €`, alignment: 'right' },
                  ],
                  [
                    { text: 'Total TTC', bold: true, alignment: 'right' },
                    {
                      text: `${Number(invoice.totalTtc).toFixed(2)} €`,
                      bold: true,
                      alignment: 'right',
                    },
                  ],
                ],
              },
              layout: 'noBorders',
            },
          ],
        },
      ],
      styles: {
        header: { fontSize: 16, bold: true, marginBottom: 4 },
        invoiceTitle: { fontSize: 22, bold: true, color: '#333' },
        invoiceNumber: { fontSize: 13, color: '#555', marginBottom: 4 },
        subtext: { fontSize: 9, color: '#666', marginBottom: 2 },
        sectionTitle: { fontSize: 11, bold: true, marginBottom: 4, color: '#333' },
        tableHeader: { bold: true, fillColor: '#f0f0f0' },
      },
    };
  }
}
