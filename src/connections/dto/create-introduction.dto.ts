import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateIntroductionDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsString()
  advisorId: string;

  @ApiProperty({
    example:
      'I would like to discuss potential advisory services for our technology company.',
    required: false,
  })
  @IsOptional()
  @IsString()
  message?: string;
}
