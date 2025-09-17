import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmPaymentDto {
  @IsString()
  @ApiProperty({
    description: 'Stripe payment intent ID',
    example: 'pi_1234567890abcdef',
  })
  paymentIntentId: string;
}
