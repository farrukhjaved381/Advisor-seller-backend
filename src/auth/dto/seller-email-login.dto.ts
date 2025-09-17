import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class SellerEmailLoginDto {
  @ApiProperty({
    description: 'Seller email address',
    example: 'seller@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
