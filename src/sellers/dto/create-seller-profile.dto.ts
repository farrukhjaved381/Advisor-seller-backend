import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSellerProfileDto {
  @IsString()
  @ApiProperty({ 
    description: 'Company name', 
    example: 'TechCorp Solutions Inc.' 
  })
  companyName: string;

  @IsString()
  @ApiProperty({ 
    description: 'Industry sector', 
    example: 'Technology' 
  })
  industry: string;

  @IsString()
  @ApiProperty({ 
    description: 'Geographic location', 
    example: 'North America' 
  })
  geography: string;

  @IsNumber()
  @Min(0)
  @ApiProperty({ 
    description: 'Annual revenue in USD', 
    example: 5000000 
  })
  annualRevenue: number;

  @IsOptional()
  @IsString()
  @ApiProperty({ 
    description: 'Brief company description', 
    required: false,
    example: 'Leading software development company specializing in enterprise solutions.'
  })
  description?: string;
}