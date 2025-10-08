import { ApiHideProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsInt,
  Min,
  IsISO8601,
  IsBoolean,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ExtendCouponUsageDto {
  @ApiPropertyOptional({
    description:
      'Add this many extra uses on top of the current limit. For example, enter 10 to allow 10 more people to redeem the coupon.',
    example: 10,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  additionalUses?: number;

  @ApiPropertyOptional({
    description:
      'Set a brand new total usage limit. Use this if you prefer to define the exact total number of uses instead of adding extra uses.',
    example: 40,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  newTotalLimit?: number;

  @ApiPropertyOptional({
    description:
      'Update the expiration date. After this date the coupon will no longer work. Leave blank to keep the current date.',
    example: '2026-01-31',
    format: 'date',
  })
  @IsOptional()
  @Matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
  newExpirationDate?: string;

  @ApiPropertyOptional({
    description:
      'Pick the time on that day when the coupon should expire (24-hour format).',
    example: '17:00',
    format: 'time',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  newExpirationTime?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsISO8601()
  newExpirationDateTime?: string;

  @ApiPropertyOptional({
    description:
      'Turn on to remove the expiration date entirely and keep the coupon available until the usage limit is reached.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' || normalized === '1';
    }
    return Boolean(value);
  })
  @Type(() => Boolean)
  @IsBoolean()
  clearExpiration?: boolean;
}
