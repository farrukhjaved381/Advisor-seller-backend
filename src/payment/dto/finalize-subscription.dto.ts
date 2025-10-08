import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FinalizeSubscriptionDto {
  @IsString()
  @ApiProperty({
    description: 'Stripe subscription identifier to finalize for the user',
    example: 'sub_1QxyzABC123',
  })
  subscriptionId: string;
}
