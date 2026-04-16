import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsEmail, IsString, MaxLength } from 'class-validator';

export class SendInvoiceEmailDto {
  @ApiProperty({ type: [String], maxItems: 10, example: ['client@example.com'] })
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  to!: string[];

  @ApiProperty({ maxLength: 200, example: 'Facture FAC-2026-001' })
  @IsString()
  @MaxLength(200)
  subject!: string;

  @ApiProperty({
    maxLength: 10000,
    example: 'Bonjour,\nVeuillez trouver ci-joint notre facture.\nCordialement,',
  })
  @IsString()
  @MaxLength(10_000)
  body!: string;
}
