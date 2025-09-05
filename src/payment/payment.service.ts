import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Coupon, CouponDocument } from './schemas/coupon.schema';
import { Advisor, AdvisorDocument } from '../advisors/schemas/advisor.schema';
import { UsersService } from '../users/users.service';

@Injectable()
export class PaymentService {
  private stripe: Stripe;
  private readonly membershipFee = 500000; // $5,000 in cents (minimum $5.00)

  constructor(
    @InjectModel(Coupon.name) private couponModel: Model<CouponDocument>,
    @InjectModel(Advisor.name) private advisorModel: Model<AdvisorDocument>,
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    this.stripe = new Stripe(this.configService.get('STRIPE_SECRET_KEY') || 'sk_test_default', {
      apiVersion: '2025-08-27.basil',
    });
  }

  // Creates payment intent for advisor membership fee
  async createPaymentIntent(userId: string, couponCode?: string): Promise<{ clientSecret: string; amount: number }> {
    let amount = this.membershipFee;
    let coupon: Coupon | null = null;

    // Apply coupon if provided
    if (couponCode) {
      coupon = await this.validateCoupon(couponCode);
      amount = this.calculateDiscountedAmount(amount, coupon);
    }

    // If amount is 0 (free trial), set minimum amount for Stripe
    const stripeAmount = amount === 0 ? 50 : amount; // 50 cents minimum for free trial only

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: stripeAmount,
      currency: 'usd',
      automatic_payment_methods: { 
        enabled: true,
        allow_redirects: 'never', // Keep as never for backend-only confirmation
      },
      metadata: {
        userId: userId.toString(), // Convert ObjectId to string for Stripe metadata
        couponCode: couponCode || '',
        originalAmount: this.membershipFee.toString(),
        actualAmount: amount.toString(),
      },
    });

    return {
      clientSecret: paymentIntent.client_secret!,
      amount,
    };
  }

  // Confirms payment and activates advisor profile
  async confirmPayment(userId: string, paymentIntentId: string): Promise<{ success: boolean; message: string }> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== 'succeeded') {
        throw new BadRequestException('Payment not completed');
      }

      if (paymentIntent.metadata.userId !== userId.toString()) {
        console.log('User ID mismatch:', {
          paymentIntentUserId: paymentIntent.metadata.userId,
          currentUserId: userId.toString(),
          paymentIntentId
        });
        throw new BadRequestException('Payment does not belong to this user');
      }

      // Mark user as payment verified
      await this.usersService.markPaymentVerified(
        userId,
        paymentIntentId
      );

      // Payment confirmed - user can now create advisor profile
      console.log('Payment confirmed for user:', userId, 'PaymentIntent:', paymentIntentId);

      // Update coupon usage if used
      if (paymentIntent.metadata.couponCode) {
        await this.couponModel.findOneAndUpdate(
          { code: paymentIntent.metadata.couponCode },
          { $inc: { usedCount: 1 } }
        );
      }

      return {
        success: true,
        message: 'Payment confirmed! You can now create your advisor profile.',
      };
    } catch (error) {
      throw new BadRequestException(`Payment confirmation failed: ${error.message}`);
    }
  }

  // Redeems coupon for free trial (activates profile without payment)
  async redeemCoupon(userId: string, code: string): Promise<{ success: boolean; message: string }> {
    const coupon = await this.validateCoupon(code);
    
    if (coupon.type !== 'free_trial') {
      throw new BadRequestException('This coupon is not valid for free trial');
    }

    // Mark user as payment verified
    const user = await this.usersService.markPaymentVerified(userId);

    if (!user) {
      throw new NotFoundException('User not found during coupon redemption');
    }

    // Update coupon usage
    await this.couponModel.findOneAndUpdate(
      { code },
      { $inc: { usedCount: 1 } }
    );

    return {
      success: true,
      message: 'Free trial activated successfully. You can now create your profile.',
    };
  }

  // Validates coupon code and availability
  private async validateCoupon(code: string): Promise<Coupon> {
    const coupon = await this.couponModel.findOne({ code, isActive: true });
    
    if (!coupon) {
      throw new NotFoundException('Invalid or inactive coupon code');
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new BadRequestException('Coupon has expired');
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('Coupon usage limit reached');
    }

    return coupon;
  }

  // Calculates discounted amount based on coupon
  private calculateDiscountedAmount(originalAmount: number, coupon: Coupon): number {
    if (coupon.type === 'free_trial') {
      return 0;
    }
    
    if (coupon.type === 'percentage') {
      return Math.round(originalAmount * (1 - coupon.value / 100));
    }
    
    if (coupon.type === 'fixed') {
      return Math.max(0, originalAmount - coupon.value * 100); // Convert dollars to cents
    }

    return originalAmount;
  }

  // Creates sample coupons for testing
  async createSampleCoupons(): Promise<void> {
    const sampleCoupons = [
      {
        code: 'FREETRIAL2024',
        type: 'free_trial' as const,
        value: 100,
        usageLimit: 50,
      },
      {
        code: 'DISCOUNT50',
        type: 'percentage' as const,
        value: 50,
        usageLimit: 20,
      },
      {
        code: 'SAVE1000',
        type: 'fixed' as const,
        value: 1000, // $1000 off
        usageLimit: 10,
      },
    ];

    for (const couponData of sampleCoupons) {
      await this.couponModel.findOneAndUpdate(
        { code: couponData.code },
        couponData,
        { upsert: true, new: true }
      );
    }
  }

  async handleWebhook(signature: string, payload: Buffer): Promise<{ received: boolean }> {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.configService.get('STRIPE_WEBHOOK_SECRET') || 'whsec_default',
      );
    } catch (err) {
      console.log(`Webhook signature verification failed.`, err.message);
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('PaymentIntent succeeded:', paymentIntent.id);
        
        if (paymentIntent.metadata?.userId) {
          await this.usersService.markPaymentVerified(
            paymentIntent.metadata.userId,
            paymentIntent.customer as string
          );
          console.log(`User ${paymentIntent.metadata.userId} marked as payment verified`);
        }
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    return { received: true };
  }

  async activateFreeTrial(userId: string): Promise<{ success: boolean; message: string }> {
    // Mark user as payment verified
    await this.usersService.markPaymentVerified(userId, 'free-trial');
    
    // Activate advisor profile if exists
    const advisor = await this.advisorModel.findOneAndUpdate(
      { userId },
      { isActive: true },
      { new: true }
    );

    return {
      success: true,
      message: advisor ? 'Free trial activated and profile activated' : 'Free trial activated - create profile next'
    };
  }
}