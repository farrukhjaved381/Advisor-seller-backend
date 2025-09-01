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
  @ApiProperty({ description: 'Company name' })
  companyName: string;

  @Prop({ required: true })
  @ApiProperty({ description: 'Industry' })
  industry: string;

  @Prop({ required: true })
  @ApiProperty({ description: 'Geography/location' })
  geography: string;

  @Prop({ required: true })
  @ApiProperty({ description: 'Annual revenue in USD' })
  annualRevenue: number;

  @Prop()
  @ApiProperty({ description: 'Company description' })
  description?: string;
}

export const SellerSchema = SchemaFactory.createForClass(Seller);

// Index for fast queries in matching
SellerSchema.index({ userId: 1 });
SellerSchema.index({ industry: 1, geography: 1 });