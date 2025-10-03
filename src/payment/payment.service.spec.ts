import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { PaymentService } from './payment.service';
import { Coupon } from './schemas/coupon.schema';
import { PaymentHistory } from './schemas/payment-history.schema';
import { UsersService } from '../users/users.service';
import { EmailService } from '../auth/email.service';

const mockCouponModel = {};
const mockPaymentHistoryModel = {};
const mockConfigService = {
  get: (key: string) => {
    switch (key) {
      case 'STRIPE_SECRET_KEY':
        return 'sk_test_dummy';
      case 'STRIPE_API_VERSION':
        return '2025-08-27.basil';
      default:
        return undefined;
    }
  },
};
const mockUsersService = {} as Partial<UsersService>;
const mockEmailService = {} as Partial<EmailService>;

describe('PaymentService', () => {
  let service: PaymentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: getModelToken(Coupon.name), useValue: mockCouponModel },
        {
          provide: getModelToken(PaymentHistory.name),
          useValue: mockPaymentHistoryModel,
        },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
