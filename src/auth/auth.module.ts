import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { EmailService } from './email.service';
import { CsrfService } from './csrf.service';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AdvisorsModule } from '../advisors/advisors.module';
import { SellersModule } from '../sellers/sellers.module';
import { SubscriptionGuard } from './guards/subscription.guard';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    UsersModule,
    forwardRef(() => AdvisorsModule),
    SellersModule,
    forwardRef(() => PaymentModule),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret:
          configService.get<string>('JWT_SECRET') ||
          'your-super-secret-jwt-key-change-in-production',
        signOptions: { expiresIn: '24h' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService,
    EmailService,
    CsrfService,
    JwtStrategy,
    SubscriptionGuard,
  ],
  controllers: [AuthController],
  exports: [AuthService, EmailService, CsrfService, SubscriptionGuard],
})
export class AuthModule {}
