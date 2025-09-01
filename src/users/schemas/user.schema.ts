import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

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
  role: UserRole;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: false })
  isPaymentVerified: boolean;

  @Prop()
  stripeCustomerId?: string;

  @Prop()
  emailVerificationToken?: string;

  @Prop()
  emailVerificationExpires?: Date;

  @Prop()
  refreshToken?: string;

  @Prop()
  refreshTokenExpiry?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Index for fast queries
UserSchema.index({ email: 1 });
UserSchema.index({ refreshToken: 1 });