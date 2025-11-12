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
  @ApiProperty({ description: 'Company logo URL' })
  logoUrl?: string;

  @Prop()
  @ApiProperty({ description: 'Introduction video URL', required: false })
  introVideoUrl?: string;

  @Prop({
    type: [
      {
        clientName: { type: String, required: true },
        testimonial: { type: String, required: true },
        pdfUrl: { type: String },
      },
    ],
    validate: [arrayLimit, '{PATH} exceeds the limit of 5'],
    default: [],
  })
  @ApiProperty({
    description: 'Array of client testimonials (max 5)',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        clientName: { type: 'string' },
        testimonial: { type: 'string' },
        pdfUrl: { type: 'string' },
      },
    },
  })
  testimonials: { clientName: string; testimonial: string; pdfUrl?: string }[];

  @Prop({ required: false })
  @ApiProperty({ description: 'Licensing info' })
  licensing?: string;

  @Prop({ required: true })
  @ApiProperty({ description: 'Years in business' })
  yearsExperience: number;

  @Prop({ required: true })
  @ApiProperty({ description: 'Number of transactions completed' })
  numberOfTransactions: number;

  @Prop({ required: true })
  @ApiProperty({ description: 'Phone number' })
  phone: string;

  @Prop()
  @ApiProperty({ description: 'Website address' })
  website?: string;

  @Prop({ required: true })
  @ApiProperty({ description: 'Revenue currency' })
  currency: string;

  @Prop({ required: true })
  @ApiProperty({ description: 'Company description' })
  description: string;

  @Prop({ type: { min: Number, max: Number } })
  @ApiProperty({ description: 'Revenue range for clients' })
  revenueRange?: { min: number; max: number };

  @Prop({ default: false })
  @ApiProperty({ description: 'Profile active' })
  isActive: boolean;

  @Prop({ default: true })
  @ApiProperty({ description: 'Whether to send leads' })
  sendLeads: boolean;

  @Prop({ type: Boolean, default: false })
  workedWithCimamplify: boolean;

  @Prop({ type: Number, default: 0 })
  @ApiProperty({ description: 'Number of impressions (seller views)' })
  impressions: number;
}

function arrayLimit(val: any[]) {
  return val.length <= 5;
}

export const AdvisorSchema = SchemaFactory.createForClass(Advisor);

// Indexes are managed in the service to avoid parallel array issues
