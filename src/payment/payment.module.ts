import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PaymentSeederService } from './payment-seeder.service';
import { Coupon, CouponSchema } from './schemas/coupon.schema';
import { Advisor, AdvisorSchema } from '../advisors/schemas/advisor.schema';
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
      { name: Advisor.name, schema: AdvisorSchema },
      { name: PaymentHistory.name, schema: PaymentHistorySchema },
    ]),
    ConfigModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService, PaymentSeederService],
  exports: [PaymentService],
})
export class PaymentModule {}
