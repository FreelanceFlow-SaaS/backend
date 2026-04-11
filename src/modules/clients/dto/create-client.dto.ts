import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
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

  @ApiProperty({ example: '42 rue du Commerce, 75015 Paris', description: 'Adresse complète' })
  @IsString()
  @IsNotEmpty({ message: "L'adresse ne peut pas être vide" })
  address: string;
}
