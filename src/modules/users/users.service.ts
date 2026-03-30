import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateFreelancerProfileDto } from './dto/update-freelancer-profile.dto';
import { hash } from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const hashedPassword = await hash(createUserDto.password, 12);
    
    const user = await this.prisma.user.create({
      data: {
        email: createUserDto.email,
        passwordHash: hashedPassword,
      },
      include: {
        profile: true,
      },
    });

    return user as User;
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        profile: true,
      },
    });

    return user as User | null;
  }

  async findById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
      },
    });

    return user as User | null;
  }

  async updateProfile(userId: string, updateData: UpdateFreelancerProfileDto): Promise<User> {
    // Check if profile exists, create or update accordingly
    const existingProfile = await this.prisma.freelancerProfile.findUnique({
      where: { userId },
    });

    if (existingProfile) {
      await this.prisma.freelancerProfile.update({
        where: { userId },
        data: updateData,
      });
    } else {
      await this.prisma.freelancerProfile.create({
        data: {
          ...updateData,
          userId,
        },
      });
    }

    // Return updated user with profile
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    });

    return user as User;
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user as User;
  }
}