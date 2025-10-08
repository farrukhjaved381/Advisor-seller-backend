import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePaymentMethodDto {
  @IsString()
  @ApiProperty({
    description: 'Stripe payment method identifier to set as default',
    example: 'pm_1Nz123ABCDxyz',
  })
  paymentMethodId: string;
}
