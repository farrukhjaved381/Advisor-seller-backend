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

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      metadata: {
        userId,
        couponCode: couponCode || '',
        originalAmount: this.membershipFee.toString(),
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

      if (paymentIntent.metadata.userId !== userId) {
        throw new BadRequestException('Payment does not belong to this user');
      }

      // Activate advisor profile
      const advisor = await this.advisorModel.findOneAndUpdate(
        { userId },
        { isActive: true },
        { new: true }
      );

      if (!advisor) {
        throw new NotFoundException('Advisor profile not found');
      }

      // Update coupon usage if used
      if (paymentIntent.metadata.couponCode) {
        await this.couponModel.findOneAndUpdate(
          { code: paymentIntent.metadata.couponCode },
          { $inc: { usedCount: 1 } }
        );
      }

      return {
        success: true,
        message: 'Payment confirmed and profile activated',
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

    // Activate advisor profile
    const advisor = await this.advisorModel.findOneAndUpdate(
      { userId },
      { isActive: true },
      { new: true }
    );

    if (!advisor) {
      throw new NotFoundException('Advisor profile not found');
    }

    // Update coupon usage
    await this.couponModel.findOneAndUpdate(
      { code },
      { $inc: { usedCount: 1 } }
    );

    return {
      success: true,
      message: 'Free trial activated successfully',
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
          // Mark user as payment verified
          await this.usersService.markPaymentVerified(
            paymentIntent.metadata.userId,
            paymentIntent.customer as string
          );
          
          // Activate advisor profile (single source of truth)
          await this.advisorModel.findOneAndUpdate(
            { userId: paymentIntent.metadata.userId },
            { isActive: true }
          );
          
          console.log(`User ${paymentIntent.metadata.userId} payment verified and profile activated`);
        }
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    return { received: true };
  }
}