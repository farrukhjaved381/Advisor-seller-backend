import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Coupon, CouponDocument } from './schemas/coupon.schema';
import { Advisor, AdvisorDocument } from '../advisors/schemas/advisor.schema';
import { UsersService } from '../users/users.service';
import { PaymentHistory, PaymentHistoryDocument } from './schemas/payment-history.schema';
import { Cron, CronExpression } from '@nestjs/schedule';
import { User } from '../users/schemas/user.schema';

@Injectable()
export class PaymentService {
  private stripe: Stripe;
  private readonly membershipFee = 500000; // $5,000 in cents (minimum $5.00)

  constructor(
    @InjectModel(Coupon.name) private couponModel: Model<CouponDocument>,
    @InjectModel(Advisor.name) private advisorModel: Model<AdvisorDocument>,
    @InjectModel(PaymentHistory.name) private paymentHistoryModel: Model<PaymentHistoryDocument>,
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    this.stripe = new Stripe(
      this.configService.get('STRIPE_SECRET_KEY') || 'sk_test_default',
      {
        apiVersion: '2025-08-27.basil',
      },
    );
  }

  private async ensureStripeCustomer(
    userId: string,
  ): Promise<{ user: User; customerId: string }> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: userId.toString(),
        },
      });
      customerId = customer.id;
      await this.usersService.setStripeCustomerId(userId, customerId);
    }

    return { user, customerId };
  }

  // Creates payment intent for advisor membership fee
  async createPaymentIntent(
    userId: string,
    couponCode?: string,
  ): Promise<{ clientSecret: string; amount: number }> {
    console.log('[PaymentService] createPaymentIntent for user', userId, 'coupon:', couponCode);
    const { user, customerId } = await this.ensureStripeCustomer(userId);

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
        customer: customerId,
        setup_future_usage: 'off_session',
        automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
      metadata: {
        userId: userId.toString(),
        couponCode: couponCode || '',
        originalAmount: this.membershipFee.toString(),
        actualAmount: amount.toString(),
        customerId,
      },
    });

    return {
      clientSecret: paymentIntent.client_secret!,
      amount,
    };
  }

  // Confirms payment and activates advisor profile
  async confirmPayment(
    userId: string,
    paymentIntentId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log('[PaymentService] confirmPayment for user', userId, 'intent', paymentIntentId);
      const paymentIntent =
        await this.stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== 'succeeded') {
        throw new BadRequestException('Payment not completed');
      }

      if (paymentIntent.metadata.userId !== userId.toString()) {
        console.log('User ID mismatch:', {
          paymentIntentUserId: paymentIntent.metadata.userId,
          currentUserId: userId.toString(),
          paymentIntentId,
        });
        throw new BadRequestException('Payment does not belong to this user');
      }

      const { user: userRecord, customerId: ensuredCustomerId } =
        await this.ensureStripeCustomer(userId);

      let customerId =
        (paymentIntent.customer as string | null | undefined) ||
        ensuredCustomerId ||
        null;

      if (!paymentIntent.customer && customerId) {
        await this.stripe.paymentIntents.update(paymentIntentId, {
          customer: customerId,
        });
      }

      const paymentMethodId =
        typeof paymentIntent.payment_method === 'string'
          ? paymentIntent.payment_method
          : paymentIntent.payment_method?.id;

      let billingDetails:
        | {
            paymentMethodId?: string;
            cardBrand?: string;
            cardLast4?: string;
            cardExpMonth?: number;
            cardExpYear?: number;
          }
        | undefined;

      if (paymentMethodId && customerId) {
        try {
          await this.stripe.paymentMethods.attach(paymentMethodId, {
            customer: customerId,
          });
        } catch (error: any) {
          if (error?.code !== 'resource_already_exists') {
            throw error;
          }
        }

        await this.stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });

       let cardDetails: Stripe.PaymentMethod.Card | null = null;

try {
  const paymentMethod = await this.stripe.paymentMethods.retrieve(paymentMethodId);
  cardDetails = paymentMethod?.card ?? null;
} catch (error) {
  console.warn(
    '[PaymentService] Unable to retrieve payment method details',
    (error as Error)?.message || error,
  );
}

const billingDetails = {
  paymentMethodId,
  cardBrand: cardDetails?.brand,
  cardLast4: cardDetails?.last4,
  cardExpMonth: cardDetails?.exp_month,
  cardExpYear: cardDetails?.exp_year,
};

      }

      // Mark user as payment verified and start/renew subscription period
      let user = await this.usersService.markPaymentVerified(
        userId,
        customerId || undefined,
        billingDetails,
      );

      // Payment confirmed - user can now create advisor profile
      console.log(
        'Payment confirmed for user:',
        userId,
        'PaymentIntent:',
        paymentIntentId,
      );

      // Ensure subscription period is valid (guard against anomalous future-only windows)
      try {
        const now = new Date();
        const s = user?.subscription || ({} as any);
        const start = s.currentPeriodStart ? new Date(s.currentPeriodStart) : null;
        const end = s.currentPeriodEnd ? new Date(s.currentPeriodEnd) : null;
        const hasValidCurrentCycle = !!(start && end && start <= now && end > now);
        if (!hasValidCurrentCycle) {
          const normStart = now;
          const normEnd = new Date(now.getTime());
          normEnd.setFullYear(normEnd.getFullYear() + 1);
          console.warn('[PaymentService] Normalizing subscription period post-payment', {
            userId: userId?.toString?.() || userId,
            prevStart: start,
            prevEnd: end,
            normStart,
            normEnd,
          });
          user = await this.usersService.normalizeSubscription(userId, normStart, normEnd);
        }
      } catch (e) {
        console.warn('[PaymentService] normalize guard failed (non-fatal):', e?.message || e);
      }

      // Append payment history
      // Persist to separate payment history collection
      const periodStart = user?.subscription?.currentPeriodStart ? new Date(user.subscription.currentPeriodStart) : undefined;
      const periodEnd = user?.subscription?.currentPeriodEnd ? new Date(user.subscription.currentPeriodEnd) : undefined;
      await this.paymentHistoryModel.create({
        userId,
        provider: 'stripe',
        paymentId: paymentIntent.id,
        amount: paymentIntent.amount_received || paymentIntent.amount || 0,
        currency: paymentIntent.currency || 'usd',
        status: paymentIntent.status,
        description: 'Advisor membership payment',
        periodStart,
        periodEnd,
        metadata: paymentIntent.metadata || {},
      });

      // Update coupon usage if used
      if (paymentIntent.metadata.couponCode) {
        await this.couponModel.findOneAndUpdate(
          { code: paymentIntent.metadata.couponCode },
          { $inc: { usedCount: 1 } },
        );
      }

      return {
        success: true,
        message: 'Payment confirmed! You can now create your advisor profile.',
      };
    } catch (error) {
      console.error('[PaymentService] confirmPayment error:', error?.message || error);
      throw new BadRequestException(
        `Payment confirmation failed: ${error.message}`,
      );
    }
  }

  // Redeems coupon for free trial (activates profile without payment)
  async redeemCoupon(
    userId: string,
    code: string,
  ): Promise<{ success: boolean; message: string }> {
    console.log('[PaymentService] redeemCoupon for user', userId, 'code', code);
    const coupon = await this.validateCoupon(code);

    if (coupon.type !== 'free_trial') {
      throw new BadRequestException('This coupon is not valid for free trial');
    }

    // Mark user as payment verified
    const user = await this.usersService.markPaymentVerified(userId);

    if (!user) {
      throw new NotFoundException('User not found during coupon redemption');
    }

    // For free trial, set a shorter subscription period (e.g., 30 days)
    if (user?.subscription) {
      const now = new Date();
      const end = new Date(now.getTime());
      end.setDate(end.getDate() + 30);
      user.subscription.currentPeriodStart = now;
      user.subscription.currentPeriodEnd = end;
      user.subscription.status = 'active';
      user.subscription.cancelAtPeriodEnd = false;
      await (this as any).usersService.userModel.findByIdAndUpdate(userId, {
        subscription: user.subscription,
      });
    }

    // Append history record for trial activation (separate collection)
    await this.paymentHistoryModel.create({
      userId,
      provider: 'coupon',
      paymentId: `trial-${Date.now()}`,
      amount: 0,
      currency: 'usd',
      status: 'succeeded',
      description: 'Free trial activation',
      periodStart: user?.subscription?.currentPeriodStart,
      periodEnd: user?.subscription?.currentPeriodEnd,
      metadata: { code },
    });

    // Update coupon usage
    await this.couponModel.findOneAndUpdate(
      { code },
      { $inc: { usedCount: 1 } },
    );

    return {
      success: true,
      message:
        'Free trial activated successfully. You can now create your profile.',
    };
  }

  async createSetupIntent(
    userId: string,
  ): Promise<{ clientSecret: string }> {
    const { customerId } = await this.ensureStripeCustomer(userId);
    const setupIntent = await this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: {
        userId: userId.toString(),
        customerId,
      },
    });

    return { clientSecret: setupIntent.client_secret! };
  }

  async updatePaymentMethod(
    userId: string,
    paymentMethodId: string,
  ): Promise<{
    success: boolean;
    billing: Record<string, any>;
    subscription?: User['subscription'];
    autoChargeFailed?: boolean;
  }> {
    const { user, customerId } = await this.ensureStripeCustomer(userId);
    const previousMethodId = user.billing?.defaultPaymentMethodId;

    try {
      await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
    } catch (error: any) {
      if (error?.code !== 'resource_already_exists') {
        throw error;
      }
    }

    await this.stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const paymentMethod = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    const card = paymentMethod?.card;
    const billingDetails = {
      paymentMethodId,
      cardBrand: card?.brand,
      cardLast4: card?.last4,
      cardExpMonth: card?.exp_month,
      cardExpYear: card?.exp_year,
    };

    await this.usersService.updateBillingDetails(userId, billingDetails);

    if (
      previousMethodId &&
      previousMethodId !== paymentMethodId
    ) {
      try {
        await this.stripe.paymentMethods.detach(previousMethodId);
      } catch (error) {
        console.warn(
          '[PaymentService] Failed to detach previous payment method',
          { previousMethodId, error: error?.message || error },
        );
      }
    }

    let subscriptionUpdate;
    let autoChargeFailed = false;
    const subscriptionEnd = user.subscription?.currentPeriodEnd
      ? new Date(user.subscription.currentPeriodEnd)
      : null;
    const requiresImmediateRenewal =
      subscriptionEnd &&
      subscriptionEnd <= new Date() &&
      ['past_due', 'expired'].includes(user.subscription?.status as any);

    if (requiresImmediateRenewal) {
      try {
        const paymentIntent = await this.stripe.paymentIntents.create({
          amount: this.membershipFee,
          currency: 'usd',
          customer: customerId,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
          metadata: {
            userId: String((user as any)._id),
            origin: 'manual_card_update',
            originalAmount: this.membershipFee.toString(),
            actualAmount: this.membershipFee.toString(),
            customerId,
          },
        });

        const updatedUser = await this.usersService.markPaymentVerified(
          userId,
          customerId,
          billingDetails,
        );
        subscriptionUpdate = updatedUser?.subscription;

        const periodStart = updatedUser?.subscription?.currentPeriodStart
          ? new Date(updatedUser.subscription.currentPeriodStart)
          : user.subscription?.currentPeriodStart;
        const periodEnd = updatedUser?.subscription?.currentPeriodEnd
          ? new Date(updatedUser.subscription.currentPeriodEnd)
          : user.subscription?.currentPeriodEnd;

        await this.paymentHistoryModel.create({
          userId: (user as any)._id,
          provider: 'stripe',
          paymentId: paymentIntent.id,
          amount:
            paymentIntent.amount_received || paymentIntent.amount || this.membershipFee,
          currency: paymentIntent.currency || 'usd',
          status: paymentIntent.status,
          description: 'Membership renewal after card update',
          periodStart,
          periodEnd,
          metadata: paymentIntent.metadata || {},
        });
      } catch (error: any) {
        console.error('[PaymentService] Renewal charge after card update failed', {
          userId: String((user as any)._id),
          error: error?.message || error,
        });
          await this.usersService.markSubscriptionStatus(userId, 'past_due');
          autoChargeFailed = true;
      }
    }

    return {
      success: true,
      billing: {
        defaultPaymentMethodId: billingDetails.paymentMethodId,
        cardBrand: billingDetails.cardBrand,
        cardLast4: billingDetails.cardLast4,
        expMonth: billingDetails.cardExpMonth,
        expYear: billingDetails.cardExpYear,
      },
      subscription: subscriptionUpdate,
      autoChargeFailed,
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
  private calculateDiscountedAmount(
    originalAmount: number,
    coupon: Coupon,
  ): number {
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
        { upsert: true, new: true },
      );
    }
  }

  async handleWebhook(
    signature: string,
    payload: Buffer,
  ): Promise<{ received: boolean }> {
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
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        console.log('PaymentIntent succeeded:', paymentIntent.id);

        if (paymentIntent.metadata?.userId) {
          await this.usersService.markPaymentVerified(
            paymentIntent.metadata.userId,
            paymentIntent.customer as string,
          );
          console.log(
            `User ${paymentIntent.metadata.userId} marked as payment verified`,
          );
        }
        break;
      }
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    return { received: true };
  }

  async activateFreeTrial(
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    // Mark user as payment verified
    await this.usersService.markPaymentVerified(userId, 'free-trial');

    // Activate advisor profile if exists
    const advisor = await this.advisorModel.findOneAndUpdate(
      { userId },
      { isActive: true },
      { new: true },
    );

    return {
      success: true,
      message: advisor
        ? 'Free trial activated and profile activated'
        : 'Free trial activated - create profile next',
    };
  }

  async getHistory(userId: string) {
    const items = await this.paymentHistoryModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean();
    return { paymentHistory: items };
  }

  async cancelAtPeriodEnd(userId: string) {
    const user = await this.usersService.cancelSubscriptionAtPeriodEnd(userId);
    return { subscription: user?.subscription };
  }

  async resume(userId: string) {
    const user = await this.usersService.resumeSubscription(userId);
    return { subscription: user?.subscription };
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async processAutomaticRenewals(): Promise<void> {
    const now = new Date();
    let users: User[] = [];
    try {
      users = await this.usersService.findAdvisorsDueForRenewal(now);
    } catch (error) {
      console.error('[PaymentService] Failed to fetch users for auto-renewal', error);
      return;
    }

    if (!users.length) {
      return;
    }

    for (const user of users) {
      const userIdStr = String((user as any)._id);
      const attemptAt = new Date();
      await this.usersService.recordAutoRenewAttempt(userIdStr, attemptAt);

      if (!user.stripeCustomerId || !user.billing?.defaultPaymentMethodId) {
        await this.usersService.markSubscriptionStatus(userIdStr, 'past_due');
        continue;
      }

      try {
        const paymentIntent = await this.stripe.paymentIntents.create({
          amount: this.membershipFee,
          currency: 'usd',
          customer: user.stripeCustomerId,
          payment_method: user.billing.defaultPaymentMethodId,
          off_session: true,
          confirm: true,
          metadata: {
            userId: userIdStr,
            origin: 'auto_renewal',
            originalAmount: this.membershipFee.toString(),
            actualAmount: this.membershipFee.toString(),
            customerId: user.stripeCustomerId,
          },
        });

        const billingDetails = {
          paymentMethodId: user.billing.defaultPaymentMethodId,
          cardBrand: user.billing.cardBrand,
          cardLast4: user.billing.cardLast4,
          cardExpMonth: user.billing.expMonth,
          cardExpYear: user.billing.expYear,
        };

        const updatedUser = await this.usersService.markPaymentVerified(
          userIdStr,
          user.stripeCustomerId,
          billingDetails,
        );

        const periodStart = updatedUser?.subscription?.currentPeriodStart
          ? new Date(updatedUser.subscription.currentPeriodStart)
          : user.subscription?.currentPeriodStart;
        const periodEnd = updatedUser?.subscription?.currentPeriodEnd
          ? new Date(updatedUser.subscription.currentPeriodEnd)
          : user.subscription?.currentPeriodEnd;

        await this.paymentHistoryModel.create({
          userId: (user as any)._id,
          provider: 'stripe',
          paymentId: paymentIntent.id,
          amount: paymentIntent.amount_received || paymentIntent.amount || this.membershipFee,
          currency: paymentIntent.currency || 'usd',
          status: paymentIntent.status,
          description: 'Automatic membership renewal',
          periodStart,
          periodEnd,
          metadata: paymentIntent.metadata || {},
        });
      } catch (error: any) {
        console.error('[PaymentService] Automatic renewal failed', {
          userId: userIdStr,
          error: error?.message || error,
        });

        await this.usersService.markSubscriptionStatus(userIdStr, 'past_due');

        await this.paymentHistoryModel.create({
          userId: (user as any)._id,
          provider: 'stripe',
          paymentId:
            error?.payment_intent?.id || `auto-renew-failed-${Date.now()}`,
          amount: this.membershipFee,
          currency: 'usd',
          status: 'failed',
          description: 'Automatic renewal failed',
          periodStart: user.subscription?.currentPeriodStart,
          periodEnd: user.subscription?.currentPeriodEnd,
          metadata: {
            reason: error?.message || 'Automatic renewal failed',
            code: error?.code,
          },
        });
      }
    }
  }
}
