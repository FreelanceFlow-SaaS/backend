import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../common/prisma/prisma.service';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateFreelancerProfileDto } from './dto/update-freelancer-profile.dto';
import { hash } from 'bcryptjs';

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
}
