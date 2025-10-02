import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class AdvisorCardDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;

  @ApiProperty({ example: 'ABC Consulting LLC' })
  companyName: string;

  @ApiProperty({ example: ['Technology', 'Healthcare'] })
  industries: string[];

  @ApiProperty({
    example: ['Technology'],
    description: 'Matched industries based on seller profile',
  })
  matchedIndustries: string[];

  @ApiProperty({ example: ['North America', 'Europe'] })
  geographies: string[];

  @ApiProperty({
    example: ['United States > California'],
    description: 'Matched geography paths based on seller profile',
  })
  matchedGeographies: string[];

  @ApiProperty({ example: 15 })
  yearsExperience: number;

  @IsOptional()
  @ApiProperty({ example: 'Licensed CPA, MBA Finance' })
  licensing?: string;

  @ApiProperty({ example: { min: 1000000, max: 50000000 } })
  revenueRange?: { min: number; max: number };

  @ApiProperty({ example: 'John Doe' })
  advisorName: string;

  @ApiProperty({ example: 'john@abcconsulting.com' })
  advisorEmail: string;

  @ApiProperty({ example: '+1-555-123-4567' })
  phone: string;

  @ApiProperty({ example: 'https://abcconsulting.com' })
  website?: string;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({
    example: 'Expert advisory services for technology companies.',
  })
  description: string;

  @ApiProperty({ example: 150 })
  numberOfTransactions: number;

  @ApiProperty({ example: 'https://example.com/logo.png' })
  logoUrl?: string;

  @ApiProperty({
    example: [
      {
        clientName: 'TechCorp Inc',
        testimonial:
          'Excellent advisory services, helped us scale efficiently.',
        pdfUrl: 'https://example.com/testimonial.pdf',
      },
    ],
  })
  testimonials: { clientName: string; testimonial: string; pdfUrl?: string }[];

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  workedWithCimamplify?: boolean;
}
