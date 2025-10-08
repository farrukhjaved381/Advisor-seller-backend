import { IsString, IsNumber, IsOptional, Min, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSellerProfileDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  contactName: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  @IsEmail()
  contactEmail: string;

  @ApiProperty({ example: 'CEO' })
  @IsString()
  contactTitle: string;

  @ApiProperty({ example: 'TechCorp Solutions Inc.' })
  @IsString()
  companyName: string;

  @ApiProperty({ example: '+1-555-123-4567' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'https://techcorp.com', required: false })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiProperty({ example: 'Technology' })
  @IsString()
  industry: string;

  @ApiProperty({ example: 'North America' })
  @IsString()
  geography: string;

  @ApiProperty({ example: 5000000, description: 'Annual revenue' })
  @IsNumber()
  @Min(0)
  annualRevenue: number;

  @ApiProperty({ example: 'USD' })
  @IsString()
  currency: string;

  @ApiProperty({
    example:
      'Leading software development company specializing in enterprise solutions.',
  })
  @IsString()
  description: string;
}
