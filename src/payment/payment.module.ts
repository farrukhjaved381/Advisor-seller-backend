import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PaymentNotificationsService } from './payment-notifications.service';
import { PaymentRetryService } from './payment-retry.service';
import { Coupon, CouponSchema } from './schemas/coupon.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
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
      { name: User.name, schema: UserSchema },
    ]),
    ConfigModule,
    UsersModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [PaymentController],
  providers: [PaymentService, PaymentNotificationsService, PaymentRetryService],
  exports: [PaymentService],
})
export class PaymentModule {}
