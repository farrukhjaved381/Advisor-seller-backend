import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose'; // MongoDB integration
import { ThrottlerModule } from '@nestjs/throttler'; // Rate limiting
import { ConfigModule, ConfigService } from '@nestjs/config'; // For env config
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AdvisorsModule } from './advisors/advisors.module';
import { SellersModule } from './sellers/sellers.module';
import { MatchingModule } from './matching/matching.module';
import { ConnectionsModule } from './connections/connections.module';
import { PaymentModule } from './payment/payment.module';
import { UploadModule } from './upload/upload.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'node_modules', 'swagger-ui-dist'),
      serveRoot: '/docs',
    }),
    ConfigModule.forRoot({ isGlobal: true }), // Load .env globally
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 600000, // 10 minutes in milliseconds
        limit: 100,
      },
    ]),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    AdvisorsModule,
    SellersModule,
    MatchingModule,
    ConnectionsModule,
    PaymentModule,
    UploadModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
