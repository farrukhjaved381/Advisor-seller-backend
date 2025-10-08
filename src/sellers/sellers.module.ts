import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SellersController } from './sellers.controller';
import { SellersService } from './sellers.service';
import { Seller, SellerSchema } from './schemas/seller.schema';
import { UsersModule } from '../users/users.module';
import { MatchingModule } from '../matching/matching.module';
import { EmailService } from '../auth/email.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Seller.name, schema: SellerSchema }]),
    UsersModule,
    MatchingModule,
  ],
  controllers: [SellersController],
  providers: [SellersService, EmailService],
  exports: [SellersService],
})
export class SellersModule {}
