import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { Advisor, AdvisorSchema } from '../advisors/schemas/advisor.schema';
import { Seller, SellerSchema } from '../sellers/schemas/seller.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { MatchingModule } from '../matching/matching.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Advisor.name, schema: AdvisorSchema },
      { name: Seller.name, schema: SellerSchema },
      { name: User.name, schema: UserSchema },
    ]),
    MatchingModule,
    AuthModule,
  ],
  controllers: [ConnectionsController],
  providers: [ConnectionsService],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}