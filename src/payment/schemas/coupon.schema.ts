import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type CouponDocument = Coupon & Document;

@Schema({ timestamps: true })
export class Coupon {
  @Prop({ required: true, unique: true })
  @ApiProperty({ description: 'Coupon code' })
  code: string;

  @Prop({ required: true })
  @ApiProperty({ description: 'Discount type: percentage or fixed' })
  type: 'percentage' | 'fixed' | 'free_trial';

  @Prop({ required: true })
  @ApiProperty({ description: 'Discount value' })
  value: number;

  @Prop({ default: true })
  @ApiProperty({ description: 'Is coupon active' })
  isActive: boolean;

  @Prop()
  @ApiProperty({ description: 'Expiry date' })
  expiresAt?: Date;

  @Prop({ default: 0 })
  @ApiProperty({ description: 'Times used' })
  usedCount: number;

  @Prop()
  @ApiProperty({ description: 'Usage limit' })
  usageLimit?: number;
}

export const CouponSchema = SchemaFactory.createForClass(Coupon);
CouponSchema.index({ code: 1 });
