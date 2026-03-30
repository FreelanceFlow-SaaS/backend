import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';

@ApiTags('Invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  // TODO: Implement CRUD endpoints for invoices
  // - GET /invoices (list user's invoices)
  // - POST /invoices (create invoice)
  // - GET /invoices/:id (get invoice by id)
  // - PATCH /invoices/:id (update invoice)
  // - DELETE /invoices/:id (delete invoice)
  // - PATCH /invoices/:id/status (change status)
}