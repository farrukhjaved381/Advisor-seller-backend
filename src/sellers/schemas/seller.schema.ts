import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type SellerDocument = Seller & Document;

@Schema({ timestamps: true })
export class Seller {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  @ApiProperty({ description: 'Linked user ID' })
  userId: Types.ObjectId;

  @Prop({ required: true })
  @ApiProperty({ description: 'Primary contact name' })
  contactName: string;

  @Prop({ required: true })
  @ApiProperty({ description: 'Primary contact email address' })
  contactEmail: string;

  @Prop({ required: true })
  @ApiProperty({ description: 'Primary contact title' })
  contactTitle: string;

  @Prop({ required: true })
  @ApiProperty({ description: 'Company name' })
  companyName: string;

  @Prop({ required: true })
  @ApiProperty({ description: 'Industry' })
  industry: string;

  @Prop({ required: true })
  @ApiProperty({ description: 'Geography/location' })
  geography: string;

  @Prop({ required: true })
  @ApiProperty({ description: 'Annual revenue' })
  annualRevenue: number;

  @Prop({ required: true })
  @ApiProperty({ description: 'Revenue currency' })
  currency: string;

  @Prop({ required: true })
  @ApiProperty({ description: 'Phone number' })
  phone: string;

  @Prop({ required: true })
  @ApiProperty({ description: 'Website address' })
  website?: string;

  @Prop({ required: true })
  @ApiProperty({ description: 'Company description' })
  description: string;

  @Prop({ default: true })
  @ApiProperty({ description: 'Profile active status' })
  isActive: boolean;
}

export const SellerSchema = SchemaFactory.createForClass(Seller);

// Index for fast queries in matching
SellerSchema.index({ userId: 1 });
SellerSchema.index({ industry: 1, geography: 1 });
