import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Inject,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiProduces,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RouteUserThrottlerGuard } from '../../common/throttler/route-user-throttler.guard';
import { MailService } from '../mail/mail.service';
import {
  INVOICE_EMAIL_ENQUEUE,
  type InvoiceEmailEnqueue,
} from '../invoice-email/invoice-email-enqueue.token';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { UpdateInvoiceLinesDto } from './dto/update-invoice-lines.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';
import { SendInvoiceEmailDto } from './dto/send-invoice-email.dto';

@ApiTags('Invoices')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    @Inject(INVOICE_EMAIL_ENQUEUE) private readonly invoiceEmailEnqueue: InvoiceEmailEnqueue,
    private readonly mailService: MailService
  ) {}

  @Post()
  @ApiOperation({ summary: 'Créer une nouvelle facture' })
  @ApiResponse({ status: 201, description: 'Facture créée avec succès.' })
  @ApiResponse({
    status: 400,
    description: 'Données invalides (lignes vides, taux négatif, etc.).',
  })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  @ApiResponse({
    status: 404,
    description: 'Client introuvable ou appartenant à un autre utilisateur.',
  })
  create(@Req() req: any, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: "Lister toutes les factures de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Liste des factures.' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  findAll(@Req() req: any) {
    return this.invoicesService.findAll(req.user.id);
  }

  @Get('export')
  @ApiOperation({ summary: 'Exporter toutes les factures au format CSV (UTF-8)' })
  @ApiProduces('text/csv')
  @ApiResponse({ status: 200, description: 'Fichier CSV des factures.' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  async exportCsv(@Req() req: any, @Res() res: Response) {
    try {
      const csv = await this.invoicesService.exportCsv(req.user.id);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="factures.csv"');
      res.send('\uFEFF' + csv);
    } catch {
      res
        .status(500)
        .json({ statusCode: 500, message: 'Erreur lors de la génération du fichier CSV' });
    }
  }

  @Post(':id/send-email')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(RouteUserThrottlerGuard)
  @ApiOperation({
    summary: "Mettre en file d'envoi un email de facture (PDF + message)",
    description:
      "Réponse **202 Accepted** avec `jobId` : la demande est acceptée pour traitement asynchrone. Cela **ne garantit pas** que l'email a été délivré au(x) destinataire(s) (voir README — sémantique NFR-I2).",
  })
  @ApiResponse({
    status: 202,
    description: 'Demande acceptée — job BullMQ créé ; livraison SMTP traitée par le worker.',
  })
  @ApiResponse({ status: 400, description: 'Facture annulée ou données invalides.' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  @ApiResponse({ status: 404, description: 'Facture introuvable.' })
  @ApiResponse({ status: 429, description: 'Trop de requêtes (limite par utilisateur et route).' })
  @ApiResponse({
    status: 503,
    description: 'Redis (file) ou SMTP non configuré pour cet environnement.',
  })
  async sendInvoiceEmail(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SendInvoiceEmailDto
  ) {
    const invoice = await this.invoicesService.findOne(id, req.user.id);
    if (invoice.status === 'cancelled') {
      throw new BadRequestException("Impossible d'envoyer par email une facture annulée.");
    }
    if (!this.mailService.isConfigured()) {
      throw new ServiceUnavailableException(
        'Configuration email incomplète. Renseignez SMTP_HOST (voir README et .env.example).'
      );
    }
    const jobId = await this.invoiceEmailEnqueue.enqueueSendInvoiceEmail({
      userId: req.user.id,
      invoiceId: id,
      to: dto.to,
      subject: dto.subject,
      body: dto.body,
    });
    return {
      jobId,
      status: 'accepted',
      message:
        "Demande d'envoi acceptée pour traitement asynchrone. Ce message ne confirme pas la livraison chez le destinataire.",
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une facture par son identifiant' })
  @ApiParam({ name: 'id', description: 'UUID de la facture' })
  @ApiResponse({ status: 200, description: 'Facture trouvée.' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  @ApiResponse({ status: 404, description: 'Facture introuvable.' })
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.invoicesService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: "Mettre à jour les métadonnées d'une facture (brouillon uniquement)" })
  @ApiParam({ name: 'id', description: 'UUID de la facture' })
  @ApiResponse({ status: 200, description: 'Facture mise à jour.' })
  @ApiResponse({
    status: 400,
    description: "Modification impossible — la facture n'est pas en brouillon.",
  })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  @ApiResponse({ status: 404, description: 'Facture introuvable.' })
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.invoicesService.update(id, req.user.id, dto);
  }

  @Patch(':id/lines')
  @ApiOperation({ summary: "Remplacer toutes les lignes d'une facture (brouillon uniquement)" })
  @ApiParam({ name: 'id', description: 'UUID de la facture' })
  @ApiResponse({ status: 200, description: 'Lignes remplacées, totaux recalculés.' })
  @ApiResponse({ status: 400, description: 'Données invalides ou facture non modifiable.' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  @ApiResponse({ status: 404, description: 'Facture introuvable.' })
  updateLines(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateInvoiceLinesDto) {
    return this.invoicesService.updateLines(id, req.user.id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: "Changer le statut d'une facture" })
  @ApiParam({ name: 'id', description: 'UUID de la facture' })
  @ApiResponse({ status: 200, description: 'Statut mis à jour.' })
  @ApiResponse({
    status: 400,
    description:
      'Transition de statut invalide. Transitions autorisées: draft→sent, draft→cancelled, sent→paid, sent→cancelled.',
  })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  @ApiResponse({ status: 404, description: 'Facture introuvable.' })
  updateStatus(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateInvoiceStatusDto) {
    return this.invoicesService.updateStatus(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une facture (brouillon ou annulée uniquement)' })
  @ApiParam({ name: 'id', description: 'UUID de la facture' })
  @ApiResponse({ status: 204, description: 'Facture supprimée.' })
  @ApiResponse({
    status: 400,
    description:
      'Suppression impossible — seules les factures en brouillon ou annulées peuvent être supprimées.',
  })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  @ApiResponse({ status: 404, description: 'Facture introuvable.' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.invoicesService.remove(id, req.user.id);
  }
}
