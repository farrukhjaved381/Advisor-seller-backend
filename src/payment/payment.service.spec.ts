import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { Coupon } from './schemas/coupon.schema';
import { Advisor } from '../advisors/schemas/advisor.schema';

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
    },
  }));
});

describe('PaymentService', () => {
  let service: PaymentService;

  const mockCoupon = {
    _id: 'coupon123',
    code: 'FREETRIAL2024',
    type: 'free_trial',
    value: 100,
    isActive: true,
    usedCount: 0,
    usageLimit: 50,
  };

  const mockAdvisor = {
    _id: 'advisor123',
    userId: 'user123',
    isActive: false,
  };

  const mockCouponModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };

  const mockAdvisorModel = {
    findOneAndUpdate: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('sk_test_fake_key'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: getModelToken(Coupon.name),
          useValue: mockCouponModel,
        },
        {
          provide: getModelToken(Advisor.name),
          useValue: mockAdvisorModel,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  describe('createPaymentIntent', () => {
    it('✅ should create payment intent with full amount', async () => {
      const mockStripe = require('stripe')();
      mockStripe.paymentIntents.create.mockResolvedValue({
        client_secret: 'pi_test_client_secret',
      });

      const result = await service.createPaymentIntent('user123');

      expect(result.amount).toBe(500000); // $5,000
      expect(result.clientSecret).toBe('pi_test_client_secret');
    });

    it('✅ should apply coupon discount', async () => {
      mockCouponModel.findOne.mockResolvedValue({
        ...mockCoupon,
        type: 'percentage',
        value: 50,
      });

      const mockStripe = require('stripe')();
      mockStripe.paymentIntents.create.mockResolvedValue({
        client_secret: 'pi_test_client_secret',
      });

      const result = await service.createPaymentIntent('user123', 'DISCOUNT50');

      expect(result.amount).toBe(250000); // 50% off $5,000
    });

    it('❌ should throw error for invalid coupon', async () => {
      mockCouponModel.findOne.mockResolvedValue(null);

      await expect(
        service.createPaymentIntent('user123', 'INVALID')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirmPayment', () => {
    it('✅ should confirm payment and activate profile', async () => {
      const mockStripe = require('stripe')();
      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        status: 'succeeded',
        metadata: { userId: 'user123', couponCode: '' },
      });

      mockAdvisorModel.findOneAndUpdate.mockResolvedValue({
        ...mockAdvisor,
        isActive: true,
      });

      const result = await service.confirmPayment('user123', 'pi_test_123');

      expect(result.success).toBe(true);
      expect(mockAdvisorModel.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: 'user123' },
        { isActive: true },
        { new: true }
      );
    });

    it('❌ should throw error for failed payment', async () => {
      const mockStripe = require('stripe')();
      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        status: 'requires_payment_method',
        metadata: { userId: 'user123' },
      });

      await expect(
        service.confirmPayment('user123', 'pi_test_123')
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('redeemCoupon', () => {
    it('✅ should redeem free trial coupon', async () => {
      mockCouponModel.findOne.mockResolvedValue(mockCoupon);
      mockAdvisorModel.findOneAndUpdate.mockResolvedValue({
        ...mockAdvisor,
        isActive: true,
      });

      const result = await service.redeemCoupon('user123', 'FREETRIAL2024');

      expect(result.success).toBe(true);
      expect(mockCouponModel.findOneAndUpdate).toHaveBeenCalledWith(
        { code: 'FREETRIAL2024' },
        { $inc: { usedCount: 1 } }
      );
    });

    it('❌ should throw error for non-trial coupon', async () => {
      mockCouponModel.findOne.mockResolvedValue({
        ...mockCoupon,
        type: 'percentage',
      });

      await expect(
        service.redeemCoupon('user123', 'DISCOUNT50')
      ).rejects.toThrow(BadRequestException);
    });

    it('❌ should throw error for expired coupon', async () => {
      mockCouponModel.findOne.mockResolvedValue({
        ...mockCoupon,
        expiresAt: new Date('2020-01-01'),
      });

      await expect(
        service.redeemCoupon('user123', 'EXPIRED')
      ).rejects.toThrow(BadRequestException);
    });
  });
});