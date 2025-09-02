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
    index: true 
  })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ 
    type: String, 
    enum: UserRole, 
    required: true 
  })
  @ApiProperty({ description: 'User role', enum: UserRole })
  role: UserRole;

  @Prop({ default: false })
  @ApiProperty({ description: 'Indicates if the user has completed the payment process' })
  isPaymentVerified: boolean;

  @Prop()
  @ApiProperty({ description: 'Stripe customer ID' })
  stripeCustomerId?: string;

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