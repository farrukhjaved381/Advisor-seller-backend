import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RedeemCouponDto {
  @IsString()
  @ApiProperty({
    description: 'Coupon code to redeem',
    example: 'FREETRIAL2024',
  })
  code: string;
}
