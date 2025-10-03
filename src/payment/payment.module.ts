import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PaymentNotificationsService } from './payment-notifications.service';
import { Coupon, CouponSchema } from './schemas/coupon.schema';
import { UsersModule } from '../users/users.module';
import {
  PaymentHistory,
  PaymentHistorySchema,
} from './schemas/payment-history.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Coupon.name, schema: CouponSchema },
      { name: PaymentHistory.name, schema: PaymentHistorySchema },
    ]),
    ConfigModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService, PaymentNotificationsService],
  exports: [PaymentService],
})
export class PaymentModule {}
