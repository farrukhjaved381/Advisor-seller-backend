import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConnectionDocument = Connection & Document;

export enum ConnectionType {
  INTRODUCTION = 'introduction',
  DIRECT_LIST = 'direct-list',
}

@Schema({
  timestamps: true,
  collection: 'connections',
})
export class Connection {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sellerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Advisor', required: true })
  advisorId: Types.ObjectId;

  @Prop({ type: String, enum: ConnectionType, required: true })
  type: ConnectionType;

  // Denormalized seller snapshot at time of connection creation
  @Prop({ type: String })
  sellerCompanyName?: string;

  @Prop({ type: String })
  sellerIndustry?: string;

  @Prop({ type: String })
  sellerGeography?: string;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const ConnectionSchema = SchemaFactory.createForClass(Connection);
