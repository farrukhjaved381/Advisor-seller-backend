import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePaymentIntentDto {
  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Coupon code for discount',
    required: false,
    example: 'FREETRIAL2025',
  })
  couponCode?: string;
}
