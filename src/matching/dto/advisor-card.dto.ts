import { ApiProperty } from '@nestjs/swagger';

export class TestimonialCardDto {
  @ApiProperty({ description: 'Client name' })
  clientName: string;

  @ApiProperty({ description: 'Testimonial text' })
  testimonial: string;

  @ApiProperty({ description: 'PDF URL', required: false })
  pdfUrl?: string;
}

export class AdvisorCardDto {
  @ApiProperty({ description: 'Advisor ID' })
  id: string;

  @ApiProperty({ description: 'Company name' })
  companyName: string;

  @ApiProperty({ description: 'Industries served', type: [String] })
  industries: string[];

  @ApiProperty({ description: 'Service geographies', type: [String] })
  geographies: string[];

  @ApiProperty({ description: 'Years of experience' })
  yearsExperience: number;

  @ApiProperty({ description: 'Logo URL', required: false })
  logoUrl?: string;

  @ApiProperty({ description: 'Licensing information', required: false })
  licensing?: string;

  @ApiProperty({ description: 'Revenue range', required: false })
  revenueRange?: { min: number; max: number };

  @ApiProperty({ description: 'Testimonials', type: [TestimonialCardDto], required: false })
  testimonials?: TestimonialCardDto[];
}