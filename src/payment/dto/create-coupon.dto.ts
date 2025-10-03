import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsInt,
  Matches,
  IsISO8601,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateCouponDto {
  @ApiProperty({
    example: 'GROWTH75',
    description:
      'Short code the owner will share with advisors. Use only letters, numbers, dash, or underscore (no spaces).',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  code!: string;

  @ApiProperty({
    description:
      'How much of the $5,000 advisor membership fee should be waived. Enter 100 for a completely free trial coupon, or another number like 75 for a 75% discount.',
    example: 75,
    minimum: 1,
    maximum: 100,
  })
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
  )
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(1)
  @Max(100)
  discountPercentage!: number;

  @ApiPropertyOptional({
    description:
      'How many people can use this coupon before it stops working. Leave blank if you want unlimited uses.',
    example: 5,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @ApiPropertyOptional({
    description:
      'Optional end date. After this date the coupon will no longer work. Example format: 2025-12-31T23:59:59.000Z',
    example: '2025-12-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
