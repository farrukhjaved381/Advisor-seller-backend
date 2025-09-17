import {
  IsArray,
  IsMongoId,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IntroductionDto {
  @IsArray()
  @IsMongoId({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ApiProperty({
    description: 'Array of selected Advisor IDs from matches',
    type: [String],
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    minItems: 1,
    maxItems: 10,
  })
  advisorIds: string[];
}
