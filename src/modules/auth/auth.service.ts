import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { Response } from 'express';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/user.entity';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async register(createUserDto: CreateUserDto): Promise<{ access_token: string; user: Partial<User> }> {
    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà');
    }

    // Hash password
    const hashedPassword = await hash(createUserDto.password, 12);

    // Create user
    const user = await this.usersService.create({
      ...createUserDto,
      password: hashedPassword,
    });

    // Generate JWT
    const payload = { email: user.email, sub: user.id };
    const access_token = this.jwtService.sign(payload, { expiresIn: '15m' });

    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
    };
  }

  async login(loginDto: LoginDto, res: Response): Promise<{ access_token: string; user: Partial<User> }> {
    // Find user by email
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Verify password
    const isPasswordValid = await compare(loginDto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Generate access token (15 minutes)
    const payload = { email: user.email, sub: user.id };
    const access_token = this.jwtService.sign(payload, { expiresIn: '15m' });

    // Generate refresh token (7 days)
    const refreshToken = this.jwtService.sign({ sub: user.id }, { expiresIn: '7d' });
    const refreshTokenHash = await hash(refreshToken, 10);

    // Store refresh token in database
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Set refresh token as HttpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
    };
  }

  async logout(userId: string, refreshToken: string, res: Response): Promise<{ message: string }> {
    if (!refreshToken || !userId) {
      throw new UnauthorizedException('Session invalide');
    }

    try {
      // Verify refresh token
      const decoded = this.jwtService.verify(refreshToken);
      
      if (decoded.sub !== userId) {
        throw new UnauthorizedException('Token invalide');
      }

      // Remove all refresh tokens for this user from database
      await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });

      // Clear refresh token cookie
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });

      return { message: 'Déconnexion réussie' };
    } catch (error) {
      // Clear cookie anyway in case of invalid token
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });

      return { message: 'Déconnexion réussie' };
    }
  }

  async refresh(refreshToken: string, res: Response): Promise<{ access_token: string }> {
    if (!refreshToken) {
      throw new UnauthorizedException('Token de rafraîchissement manquant');
    }

    try {
      // Verify refresh token
      const decoded = this.jwtService.verify(refreshToken);
      const userId = decoded.sub;

      // Check if token exists in database
      const storedTokens = await this.prisma.refreshToken.findMany({
        where: { 
          userId,
          expiresAt: { gt: new Date() }
        },
      });

      // Verify token hash matches one in database
      let validToken = false;
      for (const storedToken of storedTokens) {
        if (await compare(refreshToken, storedToken.tokenHash)) {
          validToken = true;
          break;
        }
      }

      if (!validToken) {
        throw new UnauthorizedException('Token de rafraîchissement invalide');
      }

      // Get user
      const user = await this.usersService.findById(userId);
      if (!user) {
        throw new UnauthorizedException('Utilisateur non trouvé');
      }

      // Generate new access token
      const payload = { email: user.email, sub: user.id };
      const access_token = this.jwtService.sign(payload, { expiresIn: '15m' });

      // Generate new refresh token
      const newRefreshToken = this.jwtService.sign({ sub: user.id }, { expiresIn: '7d' });
      const newRefreshTokenHash = await hash(newRefreshToken, 10);

      // Replace old refresh token with new one (rotation)
      await this.prisma.refreshToken.deleteMany({ where: { userId } });
      await this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newRefreshTokenHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Set new refresh token cookie
      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return { access_token };
    } catch (error) {
      throw new UnauthorizedException('Token de rafraîchissement invalide');
    }
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.usersService.findById(userId);
  }
}
