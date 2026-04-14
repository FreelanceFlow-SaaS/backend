import { IsEmail, IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateClientDto {
  @ApiProperty({ example: 'Sophie Martin', description: 'Nom du client' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom ne peut pas être vide' })
  name: string;

  @ApiProperty({ example: 'sophie@acme.fr', description: 'Email du client' })
  @IsEmail({}, { message: "L'email doit être une adresse email valide" })
  email: string;

  @ApiProperty({ example: 'Acme SAS', description: 'Nom de la société' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la société ne peut pas être vide' })
  company: string;

  @ApiProperty({ example: '42 rue du Commerce', description: 'Adresse (rue, numéro)' })
  @IsString()
  @IsNotEmpty({ message: "L'adresse ne peut pas être vide" })
  addressLine1: string;

  @ApiProperty({ example: '75015', description: 'Code postal' })
  @IsString()
  @IsNotEmpty({ message: 'Le code postal ne peut pas être vide' })
  zipCode: string;

  @ApiProperty({ example: 'Paris', description: 'Ville' })
  @IsString()
  @IsNotEmpty({ message: 'La ville ne peut pas être vide' })
  city: string;

  @ApiProperty({
    example: 'FR',
    description: 'Code pays ISO 3166-1 alpha-2',
    default: 'FR',
    required: false,
  })
  @IsOptional()
  @IsString()
  country?: string;
}
