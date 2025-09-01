import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type AdvisorDocument = Advisor & Document;

@Schema({ timestamps: true })
export class Advisor {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  @ApiProperty({ description: 'Linked user ID' })
  userId: Types.ObjectId;

  @Prop({ required: true })
  @ApiProperty({ description: 'Company name' })
  companyName: string;

  @Prop({ type: [String], required: true })
  @ApiProperty({ description: 'Array of industries', type: [String] })
  industries: string[];

  @Prop({ type: [String], required: true })
  @ApiProperty({ description: 'Array of geographies', type: [String] })
  geographies: string[];

  @Prop()
  @ApiProperty({ description: 'Logo URL' })
  logoUrl?: string;

  @Prop({ type: [{ clientName: String, testimonial: String, pdfUrl: String }], validate: [arrayLimit, '{PATH} exceeds the limit of 5'] })
  @ApiProperty({ description: 'Array of testimonials (max 5)' })
  testimonials?: { clientName: string; testimonial: string; pdfUrl?: string }[];

  @Prop()
  @ApiProperty({ description: 'Licensing info' })
  licensing?: string;

  @Prop({ required: true })
  @ApiProperty({ description: 'Years in business' })
  yearsExperience: number;

  @Prop({ type: { min: Number, max: Number } })
  @ApiProperty({ description: 'Revenue range for clients' })
  revenueRange?: { min: number; max: number };

  @Prop({ default: false })
  @ApiProperty({ description: 'Profile active' })
  isActive: boolean;

  @Prop({ default: true })
  @ApiProperty({ description: 'Whether to send leads' })
  sendLeads: boolean;
}

function arrayLimit(val: any[]) {
  return val.length <= 5;
}

export const AdvisorSchema = SchemaFactory.createForClass(Advisor);

// Index for fast queries and matching
AdvisorSchema.index({ userId: 1 });
AdvisorSchema.index({ industries: 1, geographies: 1 });
AdvisorSchema.index({ isActive: 1, sendLeads: 1 });