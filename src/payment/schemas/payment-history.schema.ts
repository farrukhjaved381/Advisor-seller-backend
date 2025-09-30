import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type PaymentHistoryDocument = PaymentHistory & Document;

@Schema({ timestamps: true })
export class PaymentHistory {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  @ApiProperty({ description: 'User ID' })
  userId: Types.ObjectId;

  @Prop({ default: 'stripe' })
  @ApiProperty({ description: 'Payment provider' })
  provider: string;

  @Prop({ required: true })
  @ApiProperty({
    description: 'Payment identifier (e.g., Stripe PaymentIntent ID)',
  })
  paymentId: string;

  @Prop({ required: true })
  @ApiProperty({ description: 'Amount in cents' })
  amount: number;

  @Prop({ default: 'usd' })
  @ApiProperty({ description: 'Currency code' })
  currency: string;

  @Prop({ required: true })
  @ApiProperty({
    description: 'Status of the payment (succeeded, failed, etc.)',
  })
  status: string;

  @Prop()
  @ApiProperty({ description: 'Description of the payment' })
  description?: string;

  @Prop()
  @ApiProperty({ description: 'Subscription period start if applicable' })
  periodStart?: Date;

  @Prop()
  @ApiProperty({ description: 'Subscription period end if applicable' })
  periodEnd?: Date;

  @Prop({ type: Object })
  @ApiProperty({ description: 'Additional metadata' })
  metadata?: Record<string, any>;
}

export const PaymentHistorySchema =
  SchemaFactory.createForClass(PaymentHistory);
PaymentHistorySchema.index({ userId: 1, createdAt: -1 });
