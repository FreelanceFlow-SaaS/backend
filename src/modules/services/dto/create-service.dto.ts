import { IsString, IsNotEmpty, IsNumber, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateServiceDto {
  @ApiProperty({ example: 'Développement backend', description: 'Titre de la prestation' })
  @IsString()
  @IsNotEmpty({ message: 'Le titre ne peut pas être vide' })
  title: string;

  @ApiProperty({
    example: 150.0,
    description: 'Taux horaire HT en EUR (ex: 150.00)',
    type: Number,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Le taux horaire doit être un nombre valide avec au maximum 2 décimales' }
  )
  @IsPositive({ message: 'Le taux horaire doit être supérieur à zéro' })
  hourlyRateHt: number;
}
