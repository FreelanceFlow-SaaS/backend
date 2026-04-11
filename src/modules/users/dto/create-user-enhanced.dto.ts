import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'sophie@example.com',
  })
  @IsEmail({}, { message: 'Veuillez fournir une adresse email valide' })
  @Transform(({ value }) => value?.toLowerCase().trim()) // ✅ Liberal: normalize email
  email: string;

  @ApiProperty({
    description: 'User password (minimum 8 characters)',
    example: 'securePassword123',
    minLength: 8,
  })
  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  password: string;

  // ✅ Golden Rule: Accept optional fields gracefully
  @ApiPropertyOptional({
    description: 'Optional display name (will be ignored if provided during registration)',
    example: 'Sophie Martin',
  })
  @IsOptional()
  @IsString()
  displayName?: string; // Accept but ignore during registration

  @ApiPropertyOptional({
    description: 'Client version or any other metadata (will be ignored)',
    example: 'v1.2.3',
  })
  @IsOptional()
  @IsString()
  clientVersion?: string; // Accept future client fields without breaking

  // Note: Any other unknown fields will be automatically stripped by whitelist: true
  // but won't cause validation errors due to forbidNonWhitelisted: false
}
