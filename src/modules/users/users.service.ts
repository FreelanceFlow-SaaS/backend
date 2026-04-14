import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../common/prisma/prisma.service';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateFreelancerProfileDto } from './dto/update-freelancer-profile.dto';
import { hash } from 'bcryptjs';
import {
  LOGOS_DIR,
  MAX_LOGO_HEIGHT,
  MAX_LOGO_WIDTH,
  validateMagicBytes,
} from '../../common/upload/logo-upload.config';

const USER_WITH_PROFILE = { profile: true } as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(UsersService.name)
    private readonly logger: PinoLogger
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const hashedPassword = await hash(createUserDto.password, 12);

    const user = await this.prisma.user.create({
      data: { email: createUserDto.email, passwordHash: hashedPassword },
      include: USER_WITH_PROFILE,
    });

    return user as User;
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: USER_WITH_PROFILE,
    });
    return user as User | null;
  }

  async findById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: USER_WITH_PROFILE,
    });
    return user as User | null;
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: USER_WITH_PROFILE,
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user as User;
  }

  async updateProfile(userId: string, updateData: UpdateFreelancerProfileDto): Promise<User> {
    // Verify user exists before upserting profile
    const exists = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!exists) throw new NotFoundException('Utilisateur introuvable');

    await this.prisma.freelancerProfile.upsert({
      where: { userId },
      update: updateData,

      create: { ...updateData, user: { connect: { id: userId } } } as any,
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: USER_WITH_PROFILE,
    });
    this.logger.info({ event: 'user_profile_updated', userId }, 'freelancer profile updated');
    return user as User;
  }

  async uploadLogo(userId: string, file: Express.Multer.File): Promise<{ logoStorageKey: string }> {
    // 0. Verify user exists (avoids obscure Prisma FK error on upsert connect)
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      unlinkSync(file.path);
      throw new NotFoundException('Utilisateur introuvable');
    }

    // 1. Validate magic bytes (defence against MIME spoofing)
    const buffer = readFileSync(file.path);
    if (!validateMagicBytes(buffer, file.mimetype)) {
      unlinkSync(file.path); // clean up the uploaded file
      throw new BadRequestException('Le contenu du fichier ne correspond pas au format déclaré.');
    }

    // 2. Validate dimensions with sharp
    let meta: { width?: number; height?: number };
    try {
      meta = await sharp(buffer).metadata();
    } catch {
      unlinkSync(file.path);
      throw new BadRequestException("Impossible de lire les métadonnées de l'image.");
    }
    if ((meta.width ?? 0) > MAX_LOGO_WIDTH || (meta.height ?? 0) > MAX_LOGO_HEIGHT) {
      unlinkSync(file.path);
      throw new BadRequestException(
        `Les dimensions du logo dépassent le maximum autorisé (${MAX_LOGO_WIDTH}×${MAX_LOGO_HEIGHT} px).`
      );
    }

    // 3. Delete the previous logo if a different file exists
    const profile = await this.prisma.freelancerProfile.findUnique({ where: { userId } });
    if (profile?.logoStorageKey) {
      const oldPath = join(LOGOS_DIR, profile.logoStorageKey.replace('logos/', ''));
      if (existsSync(oldPath) && oldPath !== file.path) {
        unlinkSync(oldPath);
      }
    }

    // 4. Persist the storage key (relative path within uploads/)
    const logoStorageKey = `logos/${file.filename}`;
    try {
      await this.prisma.freelancerProfile.upsert({
        where: { userId },
        update: { logoStorageKey, logoUpdatedAt: new Date() },
        create: {
          logoStorageKey,
          logoUpdatedAt: new Date(),
          user: { connect: { id: userId } },
          // Required fields with placeholder values — profile must be completed separately
          displayName: '',
          legalName: '',
          addressLine1: '',
          postalCode: '',
          city: '',
        } as any,
      });
    } catch (err) {
      // Avoid orphan file if DB write fails
      unlinkSync(file.path);
      throw err;
    }

    this.logger.info(
      { event: 'logo_uploaded', userId, logoStorageKey, size: file.size },
      'logo uploaded'
    );

    return { logoStorageKey };
  }
}
