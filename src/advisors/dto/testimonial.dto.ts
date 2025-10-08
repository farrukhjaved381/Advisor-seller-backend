import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TestimonialDto {
  @IsString()
  @ApiProperty({ description: 'Client name' })
  clientName: string;

  @IsString()
  @ApiProperty({ description: 'Testimonial text' })
  testimonial: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'PDF URL', required: false })
  pdfUrl?: string;
}
