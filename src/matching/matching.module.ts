import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MatchingService } from './matching.service';
import { Advisor, AdvisorSchema } from '../advisors/schemas/advisor.schema';
import { Seller, SellerSchema } from '../sellers/schemas/seller.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Advisor.name, schema: AdvisorSchema },
      { name: Seller.name, schema: SellerSchema },
    ]),
  ],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
