import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdvisorsController } from './advisors.controller';
import { AdvisorsService } from './advisors.service';
import { Advisor, AdvisorSchema } from './schemas/advisor.schema';
import { AdvisorImpression, AdvisorImpressionSchema } from './schemas/advisor-impression.schema';
import { Seller, SellerSchema } from '../sellers/schemas/seller.schema';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { ConnectionsModule } from '../connections/connections.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Advisor.name, schema: AdvisorSchema },
      { name: AdvisorImpression.name, schema: AdvisorImpressionSchema },
      { name: Seller.name, schema: SellerSchema },
    ]),
    UsersModule,
    forwardRef(() => AuthModule),
    ConnectionsModule,
    forwardRef(() => PaymentModule),
  ],
  controllers: [AdvisorsController],
  providers: [AdvisorsService],
  exports: [AdvisorsService],
})
export class AdvisorsModule {}
