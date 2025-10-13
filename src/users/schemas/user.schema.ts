import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type UserDocument = User & Document;

export enum UserRole {
  ADVISOR = 'advisor',
  SELLER = 'seller',
}

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({
    type: String,
    enum: UserRole,
    required: true,
  })
  @ApiProperty({ description: 'User role', enum: UserRole })
  role: UserRole;

  @Prop({ default: false })
  @ApiProperty({
    description: 'Indicates if the user has completed the payment process',
  })
  isPaymentVerified: boolean;

  @Prop()
  @ApiProperty({ description: 'Stripe customer ID' })
  stripeCustomerId?: string;

  @Prop()
  @ApiProperty({ description: 'Stripe subscription ID' })
  stripeSubscriptionId?: string;

  @Prop({
    type: {
      defaultPaymentMethodId: { type: String },
      cardBrand: { type: String },
      cardLast4: { type: String },
      expMonth: { type: Number },
      expYear: { type: Number },
      updatedAt: { type: Date },
    },
    default: null,
  })
  @ApiProperty({
    description: 'Stored billing details for automatic renewals',
    type: 'object',
    properties: {
      defaultPaymentMethodId: { type: 'string' },
      cardBrand: { type: 'string' },
      cardLast4: { type: 'string' },
      expMonth: { type: 'number' },
      expYear: { type: 'number' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  })
  billing?: {
    defaultPaymentMethodId?: string;
    cardBrand?: string;
    cardLast4?: string;
    expMonth?: number;
    expYear?: number;
    updatedAt?: Date;
  } | null;

  @Prop({
    type: {
      status: {
        type: String,
        enum: [
          'none',
          'active',
          'canceled',
          'expired',
          'past_due',
          'trialing',
          'incomplete',
          'incomplete_expired',
          'unpaid',
        ],
        default: 'none',
      },
      currentPeriodStart: { type: Date },
      currentPeriodEnd: { type: Date },
      cancelAtPeriodEnd: { type: Boolean, default: false },
      canceledAt: { type: Date },
      lastAutoRenewAttempt: { type: Date },
       isCancelled : { type: 'boolean', default: false },
    },
    default: { status: 'none' },
  })
  @ApiProperty({
    description: 'Subscription status and period details',
    type: 'object',
    additionalProperties: false,
    properties: {
      status: {
        type: 'string',
        enum: ['none', 'active', 'canceled', 'expired', 'past_due'],
      },
      currentPeriodStart: { type: 'string', format: 'date-time' },
      currentPeriodEnd: { type: 'string', format: 'date-time' },
      cancelAtPeriodEnd: { type: 'boolean' },
      canceledAt: { type: 'string', format: 'date-time' },
      lastAutoRenewAttempt: { type: 'string', format: 'date-time' },
      isCancelled : { type: 'boolean', default: false },
    },
  })
  subscription?: {
    status:
      | 'none'
      | 'active'
      | 'canceled'
      | 'expired'
      | 'past_due'
      | 'trialing'
      | 'incomplete'
      | 'incomplete_expired'
      | 'unpaid';
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    cancelAtPeriodEnd?: boolean;
    canceledAt?: Date;
    lastAutoRenewAttempt?: Date;
  };

  @Prop({
    type: [
      {
        id: { type: String },
        amount: { type: Number },
        currency: { type: String },
        status: { type: String },
        description: { type: String },
        createdAt: { type: Date, default: Date.now },
        provider: { type: String, default: 'stripe' },
      },
    ],
    default: [],
  })
  @ApiProperty({ description: 'Payment history records' })
  paymentHistory?: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    description?: string;
    createdAt: Date;
    provider?: string;
  }>;

  @Prop({ default: false })
  @ApiProperty({
    description: 'Indicates if the user has completed their profile',
  })
  isProfileComplete: boolean;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop()
  emailVerificationToken?: string;

  @Prop()
  emailVerificationExpires?: Date;

  @Prop()
  refreshToken?: string;

  @Prop()
  refreshTokenExpiry?: Date;

  @Prop()
  resetPasswordToken?: string;

  @Prop()
  resetPasswordExpiry?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Index for fast queries
UserSchema.index({ email: 1 });
UserSchema.index({ refreshToken: 1 });
