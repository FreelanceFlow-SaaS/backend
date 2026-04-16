import {
  Controller,
  Get,
  Body,
  Patch,
  Post,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  StreamableFile,
  Header,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiProduces,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateFreelancerProfileDto } from './dto/update-freelancer-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  DiskStoredUploadFile,
  logoMulterOptions,
  MAX_LOGO_SIZE_BYTES,
  MAX_LOGO_WIDTH,
  MAX_LOGO_HEIGHT,
} from '../../common/upload/logo-upload.config';

@ApiTags('Users')
@ApiBearerAuth('jwt')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get freelancer profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Profile not found.' })
  async getProfile(@Request() req: any) {
    return this.usersService.getProfile(req.user.id);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update freelancer profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  async updateProfile(@Request() req: any, @Body() updateProfileDto: UpdateFreelancerProfileDto) {
    return this.usersService.updateProfile(req.user.id, updateProfileDto);
  }

  @Post('profile/logo')
  @UseInterceptors(FileInterceptor('logo', logoMulterOptions))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Uploader le logo freelancer',
    description:
      `Formats acceptés : PNG, JPEG, WebP. ` +
      `Taille max : ${MAX_LOGO_SIZE_BYTES / 1024 / 1024} MB. ` +
      `Dimensions max : ${MAX_LOGO_WIDTH}×${MAX_LOGO_HEIGHT} px. ` +
      `L'ancien logo est supprimé automatiquement. ` +
      `Le contenu est validé par magic bytes (protection anti-spoofing MIME).`,
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { logo: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Logo uploadé.',
    schema: { example: { logoStorageKey: 'logos/uuid.png' } },
  })
  @ApiResponse({ status: 400, description: 'Fichier invalide (format, taille ou dimensions).' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  async uploadLogo(@Request() req: any, @UploadedFile() file: DiskStoredUploadFile) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu. Champ attendu : "logo".');
    }
    return this.usersService.uploadLogo(req.user.id, file);
  }

  @Get('profile/logo')
  @ApiOperation({ summary: 'Récupérer le logo (affichage)' })
  @ApiProduces('image/png', 'image/jpeg', 'image/webp')
  @ApiResponse({ status: 200, description: 'Flux image du logo (Content-Disposition: inline).' })
  @ApiResponse({ status: 404, description: 'Aucun logo ou fichier absent.' })
  @Header('Cache-Control', 'private, max-age=3600')
  async getProfileLogo(@Request() req: any): Promise<StreamableFile> {
    const { stream, mimeType } = await this.usersService.getLogoStream(req.user.id);
    return new StreamableFile(stream, {
      type: mimeType,
      disposition: 'inline; filename="logo"',
    });
  }
}
