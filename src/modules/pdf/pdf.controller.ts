import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PdfService } from './pdf.service';

@ApiTags('PDF')
@Controller('pdf')
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

  // TODO: Implement PDF generation endpoints
  // - GET /pdf/invoices/:id (generate and download PDF for invoice)
  // - POST /pdf/invoices/:id (alternative endpoint for PDF generation)
}