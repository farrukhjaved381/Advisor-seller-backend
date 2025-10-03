import {
  ApiHideProperty,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
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
    description: 'Pick the calendar date you want this coupon to stop working.',
    example: '2025-12-31',
    format: 'date',
  })
  @IsOptional()
  @Matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
  expiresDate?: string;

  @ApiPropertyOptional({
    description:
      'Pick the time on that day when the coupon should expire (24-hour format).',
    example: '17:00',
    format: 'time',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  expiresTime?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
