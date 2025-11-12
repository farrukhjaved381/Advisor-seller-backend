import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdvisorImpressionDocument = AdvisorImpression & Document;

@Schema({ timestamps: true })
export class AdvisorImpression {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sellerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Advisor', required: true })
  advisorId: Types.ObjectId;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const AdvisorImpressionSchema = SchemaFactory.createForClass(AdvisorImpression);

// Create a compound unique index for sellerId + advisorId to ensure one impression per seller per advisor
AdvisorImpressionSchema.index({ sellerId: 1, advisorId: 1 }, { unique: true });
