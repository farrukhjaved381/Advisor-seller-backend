import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSubscriptionDto {
  @IsString()
  @ApiProperty({
    description: 'Stripe payment method identifier to use for the subscription',
    example: 'pm_1Nz123ABCDxyz',
  })
  paymentMethodId: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Optional coupon code to apply to the subscription',
    required: false,
    example: 'FREETRIAL2025',
  })
  couponCode?: string;
}
