import {
  IsString,
  IsArray,
  IsNumber,
  IsOptional,
  ArrayMaxSize,
  ArrayMinSize,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { TestimonialDto } from './testimonial.dto';

class RevenueRangeDto {
  @IsNumber()
  @Min(0)
  @ApiProperty({ description: 'Minimum revenue' })
  min: number;

  @IsNumber()
  @Min(0)
  @ApiProperty({ description: 'Maximum revenue' })
  max: number;
}

export class CreateAdvisorProfileDto {
  @IsString()
  @ApiProperty({ description: 'Company name', example: 'ABC Consulting LLC' })
  companyName: string;

  @IsString()
  @ApiProperty({ example: '+1-555-123-4567' })
  phone: string;

  @IsString()
  @ApiProperty({ example: 'https://abcdconsulting.com' })
  website: string;

  @IsArray()
  @ApiProperty({
    description: 'Array of industries served',
    type: [String],
    example: ['Technology', 'Healthcare', 'Finance'],
  })
  industries: string[];

  @IsArray()
  @ApiProperty({
    description: 'Array of service geographies',
    type: [String],
    example: ['North America', 'Europe', 'Asia Pacific'],
  })
  geographies: string[];

  @IsNumber()
  @Min(0)
  @Max(100)
  @ApiProperty({ description: 'Years of experience', example: 15 })
  yearsExperience: number;

  @IsNumber()
  @Min(0)
  @ApiProperty({ example: 150 })
  numberOfTransactions: number;

  @IsString()
  @ApiProperty({ example: 'USD' })
  currency: string;

  @IsString()
  @ApiProperty({
    example:
      'Expert advisory services for technology and healthcare companies.',
  })
  description: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Licensing information' })
  licensing: string;

  @IsArray()
  @ArrayMinSize(5, { message: 'Exactly 5 testimonials are required' })
  @ArrayMaxSize(5, { message: 'Exactly 5 testimonials are required' })
  @ValidateNested({ each: true })
  @Type(() => TestimonialDto)
  @ApiProperty({
    description: 'Array of testimonials (exactly 5)',
    type: [TestimonialDto],
  })
  testimonials: TestimonialDto[];

  @ValidateNested()
  @Type(() => RevenueRangeDto)
  @ApiProperty({
    description: 'Preferred client revenue range',
    type: RevenueRangeDto,
  })
  revenueRange: RevenueRangeDto;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Logo URL', required: false })
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Introduction video URL', required: false })
  introVideoUrl?: string;

  @IsOptional()
  @ApiProperty({ description: 'Worked with Cimamplify', required: false })
  workedWithCimamplify?: boolean;
}
