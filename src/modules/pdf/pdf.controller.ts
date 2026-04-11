import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PdfService } from './pdf.service';

@ApiTags('PDF')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('pdf')
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Télécharger une facture en PDF' })
  @ApiParam({ name: 'id', description: 'UUID de la facture' })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'Fichier PDF généré et retourné en pièce jointe.' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  @ApiResponse({ status: 404, description: 'Facture introuvable.' })
  async downloadInvoicePdf(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdfService.generateInvoicePdf(id, req.user.id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${id}.pdf"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }
}
