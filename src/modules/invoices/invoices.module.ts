import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { InvoiceEmailModule } from '../invoice-email/invoice-email.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [InvoiceEmailModule, MailModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
