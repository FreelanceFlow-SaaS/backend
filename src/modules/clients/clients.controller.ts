import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiProduces } from '@nestjs/swagger';
import { Response } from 'express';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Clients')
@ApiBearerAuth('jwt')
@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un nouveau client' })
  @ApiResponse({ status: 201, description: 'Client créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Données invalides.' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  async create(@Request() req: any, @Body() dto: CreateClientDto) {
    return this.clientsService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: "Lister tous les clients de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Liste des clients.' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  async findAll(@Request() req: any) {
    return this.clientsService.findAll(req.user.id);
  }

  @Get('export')
  @ApiOperation({ summary: 'Exporter tous les clients au format CSV (UTF-8)' })
  @ApiProduces('text/csv')
  @ApiResponse({ status: 200, description: 'Fichier CSV des clients.' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  async exportCsv(@Request() req: any, @Res() res: Response) {
    try {
      const csv = await this.clientsService.exportCsv(req.user.id);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="clients.csv"');
      res.send('\uFEFF' + csv);
    } catch {
      res
        .status(500)
        .json({ statusCode: 500, message: 'Erreur lors de la génération du fichier CSV' });
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un client par son identifiant' })
  @ApiResponse({ status: 200, description: 'Client trouvé.' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  @ApiResponse({ status: 404, description: 'Client introuvable.' })
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.clientsService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un client' })
  @ApiResponse({ status: 200, description: 'Client mis à jour.' })
  @ApiResponse({ status: 400, description: 'Données invalides.' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  @ApiResponse({ status: 404, description: 'Client introuvable.' })
  async update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clientsService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un client' })
  @ApiResponse({ status: 204, description: 'Client supprimé.' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  @ApiResponse({ status: 404, description: 'Client introuvable.' })
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.clientsService.remove(id, req.user.id);
  }
}
