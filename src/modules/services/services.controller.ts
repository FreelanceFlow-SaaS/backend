import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Services')
@ApiBearerAuth('jwt')
@Controller('services')
@UseGuards(JwtAuthGuard)
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une nouvelle prestation' })
  @ApiResponse({ status: 201, description: 'Prestation créée avec succès.' })
  @ApiResponse({ status: 400, description: 'Données invalides.' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  async create(@Request() req: any, @Body() dto: CreateServiceDto) {
    return this.servicesService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: "Lister toutes les prestations de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Liste des prestations.' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  async findAll(@Request() req: any) {
    return this.servicesService.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une prestation par son identifiant' })
  @ApiResponse({ status: 200, description: 'Prestation trouvée.' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  @ApiResponse({ status: 404, description: 'Prestation introuvable.' })
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.servicesService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une prestation' })
  @ApiResponse({ status: 200, description: 'Prestation mise à jour.' })
  @ApiResponse({ status: 400, description: 'Données invalides.' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  @ApiResponse({ status: 404, description: 'Prestation introuvable.' })
  async update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.servicesService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une prestation' })
  @ApiResponse({ status: 204, description: 'Prestation supprimée.' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  @ApiResponse({ status: 404, description: 'Prestation introuvable.' })
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.servicesService.remove(id, req.user.id);
  }
}
