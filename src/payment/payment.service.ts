import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Coupon, CouponDocument } from './schemas/coupon.schema';
import { UsersService } from '../users/users.service';
import {
  PaymentHistory,
  PaymentHistoryDocument,
} from './schemas/payment-history.schema';
import { User } from '../users/schemas/user.schema';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { ExtendCouponUsageDto } from './dto/extend-coupon-usage.dto';
import { EmailService } from '../auth/email.service';

type StripeInvoiceExpanded = Stripe.Invoice & {
  payment_intent?: string | Stripe.PaymentIntent | null;
  subscription?: string | Stripe.Subscription | null;
  paid?: boolean;
};

type StripeSubscriptionExpanded = Stripe.Subscription & {
  latest_invoice?: string | StripeInvoiceExpanded | null;
  current_period_start?: number | null;
  current_period_end?: number | null;
};

@Injectable()
export class PaymentService {
  private stripe: Stripe;
  private readonly membershipFee = 500000; // $5,000 in cents (minimum $5.00)
  private readonly subscriptionPriceId: string;
  private readonly invoiceExpandParams = [
    'latest_invoice.payment_intent',
    'latest_invoice.subscription',
  ] as const;
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectModel(Coupon.name) private couponModel: Model<CouponDocument>,
    @InjectModel(PaymentHistory.name)
    private paymentHistoryModel: Model<PaymentHistoryDocument>,
    private configService: ConfigService,
    private usersService: UsersService,
    private readonly emailService: EmailService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    const apiVersion = (this.configService.get<string>('STRIPE_API_VERSION') ||
      '2025-08-27.basil') as Stripe.StripeConfig['apiVersion'];

    this.stripe = new Stripe(secretKey, {
      apiVersion,
    });

    const priceId = this.configService.get<string>('STRIPE_ANNUAL_PRICE_ID');
    if (!priceId) {
      throw new Error('STRIPE_ANNUAL_PRICE_ID is not configured');
    }
    this.subscriptionPriceId = priceId;
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

  private normalizeSubscriptionStatus(
    status?: Stripe.Subscription.Status | null,
  ) {
    if (!status) {
      return 'none';
    }

    switch (status) {
      case 'active':
      case 'trialing':
      case 'past_due':
      case 'incomplete':
      case 'incomplete_expired':
      case 'unpaid':
      case 'canceled':
        return status;
      default:
        return 'none';
    }
  }

  private async ensureStripeCouponId(coupon: Coupon): Promise<{
    couponId?: string;
    trialPeriodDays?: number;
  }> {
    if (!coupon) {
      return {};
    }

    if (coupon.type === 'free_trial') {
      const trialDays = coupon.value > 0 ? coupon.value : 30;
      return { trialPeriodDays: trialDays };
    }

    const couponId = `advisor_${coupon.code.toLowerCase()}`;
    try {
      await this.stripe.coupons.retrieve(couponId);
    } catch (error: any) {
      if (error?.statusCode === 404) {
        if (coupon.type === 'percentage') {
          await this.stripe.coupons.create({
            id: couponId,
            percent_off: coupon.value,
            duration: 'once',
          });
        } else if (coupon.type === 'fixed') {
          await this.stripe.coupons.create({
            id: couponId,
            amount_off: Math.round(coupon.value * 100),
            currency: 'usd',
            duration: 'once',
          });
        }
      } else {
        throw error;
      }
    }

    return { couponId };
  }

  private async incrementCouponUsage(code?: string) {
    if (!code) {
      return;
    }
    await this.couponModel.findOneAndUpdate(
      { code },
      { $inc: { usedCount: 1 } },
    );
  }

  private async recordPaymentHistoryFromSubscription(
    userId: string,
    subscription: Stripe.Subscription,
    paymentIntent?: Stripe.PaymentIntent | null,
  ) {
    const invoice = subscription.latest_invoice as
      | StripeInvoiceExpanded
      | string
      | null
      | undefined;
    if (!invoice) {
      return;
    }

    const expandedInvoice =
      typeof invoice === 'string'
        ? ((await this.stripe.invoices.retrieve(
            invoice,
          )) as StripeInvoiceExpanded)
        : invoice;

    const amount =
      expandedInvoice.amount_paid || expandedInvoice.amount_due || 0;
    const paymentId =
      (expandedInvoice.payment_intent as string | undefined) ||
      (paymentIntent && paymentIntent.id) ||
      expandedInvoice.id;

    const exists = await this.paymentHistoryModel.exists({
      userId,
      paymentId,
    });

    if (exists) {
      return;
    }

    await this.paymentHistoryModel.create({
      userId,
      provider: 'stripe',
      paymentId,
      amount,
      currency: expandedInvoice.currency || 'usd',
      status: expandedInvoice.paid ? 'succeeded' : expandedInvoice.status,
      description:
        expandedInvoice.billing_reason === 'subscription_create'
          ? 'Advisor membership subscription'
          : 'Advisor membership renewal',
      periodStart: expandedInvoice.period_start
        ? new Date(expandedInvoice.period_start * 1000)
        : undefined,
      periodEnd: expandedInvoice.period_end
        ? new Date(expandedInvoice.period_end * 1000)
        : undefined,
      metadata: {
        invoiceId: expandedInvoice.id,
        subscriptionId: subscription.id,
      },
    });
  }

  private async handleStripeSubscriptionEvent(
    subscription: Stripe.Subscription,
  ) {
    const expandedSubscription = subscription as StripeSubscriptionExpanded;
    const userId = expandedSubscription.metadata?.userId;
    if (!userId) {
      return;
    }

    const paymentMethodId =
      typeof expandedSubscription.default_payment_method === 'string'
        ? expandedSubscription.default_payment_method
        : expandedSubscription.default_payment_method?.id;

    let paymentMethod: Stripe.PaymentMethod | undefined;
    if (paymentMethodId) {
      try {
        paymentMethod =
          await this.stripe.paymentMethods.retrieve(paymentMethodId);
      } catch (error) {
        console.warn(
          '[PaymentService] Unable to retrieve payment method for subscription event',
          (error as Error)?.message || error,
        );
      }
    }

    const billingDetails = this.buildBillingDetails(paymentMethod);

    // Determine the correct status based on Stripe subscription state
    let localStatus = this.normalizeSubscriptionStatus(expandedSubscription.status);
    
    // If Stripe subscription is canceled but still within the period, keep it as 'canceled' locally
    // but don't change isPaymentVerified until the period actually ends
    if (expandedSubscription.status === 'canceled' && expandedSubscription.cancel_at_period_end) {
      localStatus = 'canceled';
    }

    const updatedUser = await this.usersService.updateSubscriptionFromStripe(
      userId,
      {
        subscriptionId: expandedSubscription.id,
        status: localStatus,
        currentPeriodStart: expandedSubscription.current_period_start
          ? new Date(expandedSubscription.current_period_start * 1000)
          : undefined,
        currentPeriodEnd: expandedSubscription.current_period_end
          ? new Date(expandedSubscription.current_period_end * 1000)
          : undefined,
        cancelAtPeriodEnd: expandedSubscription.cancel_at_period_end || false,
      },
      billingDetails,
    );

    const latestInvoiceRaw = expandedSubscription.latest_invoice as
      | StripeInvoiceExpanded
      | string
      | undefined;
    let paymentIntent: Stripe.PaymentIntent | undefined;

    if (latestInvoiceRaw) {
      const invoice =
        typeof latestInvoiceRaw === 'string'
          ? ((await this.stripe.invoices.retrieve(
              latestInvoiceRaw,
            )) as StripeInvoiceExpanded)
          : latestInvoiceRaw;
      paymentIntent = invoice.payment_intent as
        | Stripe.PaymentIntent
        | undefined;
    }

    if (
      updatedUser &&
      (expandedSubscription.status === 'active' ||
        expandedSubscription.status === 'trialing')
    ) {
      await this.recordPaymentHistoryFromSubscription(
        String(updatedUser._id),
        expandedSubscription,
        paymentIntent,
      );
    }
  }

  private buildBillingDetails(paymentMethod?: Stripe.PaymentMethod | null) {
    if (!paymentMethod || !paymentMethod.card) {
      return undefined;
    }

    return {
      paymentMethodId: paymentMethod.id,
      cardBrand: paymentMethod.card.brand,
      cardLast4: paymentMethod.card.last4,
      cardExpMonth: paymentMethod.card.exp_month,
      cardExpYear: paymentMethod.card.exp_year,
    };
  }

  private paymentIntentRequiresAction(
    paymentIntent?: Stripe.PaymentIntent | null,
  ) {
    if (!paymentIntent) {
      return false;
    }
    return (
      paymentIntent.status === 'requires_action' ||
      paymentIntent.status === 'requires_confirmation'
    );
  }

  private resolveExpirationDate(
    isoString?: string,
    date?: string,
    time?: string,
  ): Date | undefined {
    if (isoString) {
      const parsed = new Date(isoString);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid expiration date');
      }
      return parsed;
    }

    if (!date && time) {
      throw new BadRequestException(
        'Please provide a calendar date along with the time value.',
      );
    }

    if (date) {
      const trimmedDate = date.trim();
      if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(trimmedDate)) {
        throw new BadRequestException('Invalid expiration date');
      }

      let normalizedTime = '23:59:59';
      if (time && time.trim()) {
        const trimmedTime = time.trim();
        if (!/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.test(trimmedTime)) {
          throw new BadRequestException('Invalid expiration time');
        }
        normalizedTime =
          trimmedTime.length === 5 ? `${trimmedTime}:00` : trimmedTime;
      }

      const combined = `${trimmedDate}T${normalizedTime}`;
      const parsed = new Date(combined);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid expiration date');
      }
      return parsed;
    }

    return undefined;
  }

  async createSubscription(
    userId: string,
    paymentMethodId: string,
    couponCode?: string,
  ) {
    const { user, customerId } = await this.ensureStripeCustomer(userId);

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

    const paymentMethod =
      await this.stripe.paymentMethods.retrieve(paymentMethodId);

    let trialPeriodDays: number | undefined;
    let stripeCouponId: string | undefined;

    if (couponCode) {
      const coupon = await this.validateCoupon(couponCode);
      const couponResult = await this.ensureStripeCouponId(coupon);
      trialPeriodDays = couponResult.trialPeriodDays;
      stripeCouponId = couponResult.couponId;
    }

    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: customerId,
      items: [{ price: this.subscriptionPriceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      default_payment_method: paymentMethodId,
      collection_method: 'charge_automatically',
      expand: Array.from(this.invoiceExpandParams),
      metadata: {
        userId: String((user as any)._id),
        ...(couponCode ? { couponCode } : {}),
      },
    };

    if (typeof trialPeriodDays === 'number') {
      subscriptionParams.trial_period_days = trialPeriodDays;
    }

    if (stripeCouponId) {
      subscriptionParams.discounts = [
        {
          coupon: stripeCouponId,
        },
      ];
    }

    const subscription: StripeSubscriptionExpanded =
      (await this.stripe.subscriptions.create(
        subscriptionParams,
      )) as StripeSubscriptionExpanded;

    if (subscription.latest_invoice) {
      console.log(
        '[PaymentService] createSubscription latest_invoice summary',
        {
          type: typeof subscription.latest_invoice,
          id:
            typeof subscription.latest_invoice === 'string'
              ? subscription.latest_invoice
              : (subscription.latest_invoice as StripeInvoiceExpanded).id,
        },
      );
    } else {
      console.warn(
        '[PaymentService] createSubscription missing latest_invoice',
        {
          subscriptionId: subscription.id,
        },
      );
    }

    const latestInvoiceRaw = subscription.latest_invoice as
      | StripeInvoiceExpanded
      | string
      | undefined;
    let latestInvoice: StripeInvoiceExpanded | undefined;
    if (typeof latestInvoiceRaw === 'string') {
      latestInvoice = (await this.stripe.invoices.retrieve(latestInvoiceRaw, {
        expand: ['payment_intent'],
      })) as StripeInvoiceExpanded;
    } else {
      latestInvoice = latestInvoiceRaw;
    }

    const invoicePaymentIntent = latestInvoice
      ? ((latestInvoice.payment_intent as
          | Stripe.PaymentIntent
          | string
          | undefined) ?? (latestInvoice as any).latest_payment_intent)
      : undefined;
    let paymentIntent: Stripe.PaymentIntent | undefined;

    if (typeof invoicePaymentIntent === 'string') {
      paymentIntent =
        await this.stripe.paymentIntents.retrieve(invoicePaymentIntent);
    } else {
      paymentIntent = invoicePaymentIntent || undefined;
    }

    if (latestInvoice) {
      const paid =
        typeof latestInvoice.paid === 'boolean'
          ? latestInvoice.paid
          : latestInvoice.status === 'paid';
      console.log('[PaymentService] finalizeSubscription invoice summary', {
        invoiceId: latestInvoice.id,
        status: latestInvoice.status,
        paid,
        amountDue: latestInvoice.amount_due,
        amountPaid: latestInvoice.amount_paid,
        paymentIntentType: typeof invoicePaymentIntent,
        paymentIntentId:
          typeof invoicePaymentIntent === 'string'
            ? invoicePaymentIntent
            : invoicePaymentIntent?.id,
      });
    } else {
      console.warn(
        '[PaymentService] finalizeSubscription missing invoice object',
        {
          subscriptionId: subscription.id,
        },
      );
    }

    if (!paymentIntent && latestInvoice?.id) {
      try {
        const refreshedInvoice = (await this.stripe.invoices.retrieve(
          latestInvoice.id,
          { expand: ['payment_intent'] },
        )) as StripeInvoiceExpanded;
        const refreshedPI =
          (refreshedInvoice.payment_intent as
            | Stripe.PaymentIntent
            | string
            | undefined) ?? (refreshedInvoice as any).latest_payment_intent;
        if (typeof refreshedPI === 'string') {
          paymentIntent =
            await this.stripe.paymentIntents.retrieve(refreshedPI);
        } else if (refreshedPI) {
          paymentIntent = refreshedPI;
        }
        console.log('[PaymentService] refreshed invoice payment intent', {
          invoiceId: refreshedInvoice.id,
          paymentIntentId:
            typeof refreshedPI === 'string' ? refreshedPI : refreshedPI?.id,
          paymentIntentStatus:
            typeof refreshedPI === 'string' ? undefined : refreshedPI?.status,
          keys: Object.keys(refreshedInvoice),
        });
      } catch (error) {
        console.warn(
          '[PaymentService] Unable to refresh invoice payment intent',
          {
            invoiceId: latestInvoice.id,
            error: (error as Error)?.message || error,
          },
        );
      }
    }

    if (!paymentIntent && latestInvoice?.id) {
      try {
        const paidInvoiceResponse = await this.stripe.invoices.pay(
          latestInvoice.id,
          {
            payment_method: paymentMethodId,
          },
        );
        const paidInvoice = paidInvoiceResponse as StripeInvoiceExpanded;
        const paidPI =
          (paidInvoice.payment_intent as
            | Stripe.PaymentIntent
            | string
            | undefined) ?? (paidInvoice as any).latest_payment_intent;
        if (typeof paidPI === 'string') {
          paymentIntent = await this.stripe.paymentIntents.retrieve(paidPI);
        } else if (paidPI) {
          paymentIntent = paidPI;
        }
        console.log('[PaymentService] invoice pay result', {
          invoiceId: paidInvoice.id,
          paymentIntentId: typeof paidPI === 'string' ? paidPI : paidPI?.id,
          paymentIntentStatus:
            typeof paidPI === 'string' ? undefined : paidPI?.status,
        });
      } catch (error) {
        console.warn('[PaymentService] Unable to pay invoice immediately', {
          invoiceId: latestInvoice.id,
          error: (error as Error)?.message || error,
        });
      }
    }

    console.log('[PaymentService] createSubscription', {
      userId: String((user as any)._id),
      subscriptionId: subscription.id,
      status: subscription.status,
      latestInvoiceId: latestInvoice?.id,
      paymentIntentStatus: paymentIntent?.status,
      requiresAction: this.paymentIntentRequiresAction(paymentIntent),
    });

    if (!paymentIntent) {
      console.warn(
        '[PaymentService] No payment intent returned for subscription',
        {
          subscriptionId: subscription.id,
          status: subscription.status,
        },
      );
    }

    await this.usersService.updateSubscriptionFromStripe(
      String((user as any)._id),
      {
        subscriptionId: subscription.id,
        status: this.normalizeSubscriptionStatus(subscription.status),
        currentPeriodStart: subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000)
          : undefined,
        currentPeriodEnd: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : undefined,
        cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
        couponCode: couponCode || undefined,
      },
      this.buildBillingDetails(paymentMethod),
    );

    return {
      subscriptionId: subscription.id,
      status: subscription.status,
      clientSecret: paymentIntent?.client_secret,
      requiresAction: this.paymentIntentRequiresAction(paymentIntent),
    };
  }

  async finalizeSubscription(userId: string, subscriptionId: string) {
    const subscription: StripeSubscriptionExpanded =
      (await this.stripe.subscriptions.retrieve(subscriptionId, {
        expand: Array.from(this.invoiceExpandParams),
      })) as StripeSubscriptionExpanded;

    if (subscription.metadata?.userId !== String(userId)) {
      throw new BadRequestException(
        'Subscription does not belong to this user',
      );
    }

    const latestInvoiceRaw = subscription.latest_invoice as
      | StripeInvoiceExpanded
      | string
      | undefined;
    let paymentIntent: Stripe.PaymentIntent | undefined;
    let latestInvoice: StripeInvoiceExpanded | undefined;

    if (latestInvoiceRaw) {
      latestInvoice =
        typeof latestInvoiceRaw === 'string'
          ? ((await this.stripe.invoices.retrieve(latestInvoiceRaw, {
              expand: ['payment_intent'],
            })) as StripeInvoiceExpanded)
          : latestInvoiceRaw;
      const invoicePaymentIntent = latestInvoice.payment_intent as
        | Stripe.PaymentIntent
        | string
        | undefined;
      if (typeof invoicePaymentIntent === 'string') {
        paymentIntent =
          await this.stripe.paymentIntents.retrieve(invoicePaymentIntent);
      } else {
        paymentIntent = invoicePaymentIntent || undefined;
      }
      console.log('[PaymentService] finalizeSubscription invoice summary', {
        userId,
        invoiceId: latestInvoice.id,
        status: latestInvoice.status,
        paid: latestInvoice.paid,
        amountDue: latestInvoice.amount_due,
        amountPaid: latestInvoice.amount_paid,
        paymentIntentId: paymentIntent?.id,
        paymentIntentStatus: paymentIntent?.status,
      });
    } else {
      console.warn(
        '[PaymentService] finalizeSubscription missing latest invoice',
        {
          subscriptionId: subscription.id,
        },
      );
    }

    const paymentMethodId =
      typeof subscription.default_payment_method === 'string'
        ? subscription.default_payment_method
        : subscription.default_payment_method?.id;

    const billingDetails = paymentMethodId
      ? this.buildBillingDetails(
          await this.stripe.paymentMethods.retrieve(paymentMethodId),
        )
      : undefined;

    await this.usersService.updateSubscriptionFromStripe(
      userId,
      {
        subscriptionId: subscription.id,
        status: this.normalizeSubscriptionStatus(subscription.status),
        currentPeriodStart: subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000)
          : undefined,
        currentPeriodEnd: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : undefined,
        cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
        couponCode: subscription.metadata?.couponCode,
      },
      billingDetails,
    );

    console.log('[PaymentService] finalizeSubscription', {
      userId,
      subscriptionId: subscription.id,
      status: subscription.status,
      paymentIntentStatus: paymentIntent?.status,
      invoiceId: latestInvoice?.id,
      invoicePaid: latestInvoice?.paid,
    });

    console.log('[PaymentService] finalizeSubscription', {
      userId,
      subscriptionId: subscription.id,
      status: subscription.status,
      paymentIntentStatus: paymentIntent?.status,
      invoiceId: latestInvoice?.id,
      invoicePaid: latestInvoice?.paid,
    });

    if (
      subscription.status === 'active' ||
      subscription.status === 'trialing'
    ) {
      await this.recordPaymentHistoryFromSubscription(
        userId,
        subscription,
        paymentIntent,
      );
    }

    if (!latestInvoice || !latestInvoice.paid) {
      await this.incrementCouponUsage(subscription.metadata?.couponCode);
    }

    return {
      subscriptionId: subscription.id,
      status: subscription.status,
    };
  }

  // Creates payment intent for advisor membership fee
  async createPaymentIntent(
    userId: string,
    couponCode?: string,
  ): Promise<{ clientSecret: string; amount: number }> {
    console.log(
      '[PaymentService] createPaymentIntent for user',
      userId,
      'coupon:',
      couponCode,
    );
    const { user, customerId } = await this.ensureStripeCustomer(userId);

    let amount = this.membershipFee;
    let coupon: Coupon | null = null;

    // Apply coupon if provided
    if (couponCode) {
      coupon = await this.validateCoupon(couponCode);
      if (coupon.type === 'free_trial') {
        throw new BadRequestException(
          'Free trial coupons should be redeemed instead of creating a payment intent.',
        );
      }
      amount = this.calculateDiscountedAmount(amount, coupon);
    }

    const stripeAmount = Math.max(amount, 50);

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
      console.log(
        '[PaymentService] confirmPayment for user',
        userId,
        'intent',
        paymentIntentId,
      );
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

      const customerId =
        (paymentIntent.customer as string | null | undefined) ||
        ensuredCustomerId ||
        null;

      if (!paymentIntent.customer && customerId) {
        await this.stripe.paymentIntents.update(paymentIntentId, {
          customer: customerId,
        });
      }

      let paymentMethodId =
        typeof paymentIntent.payment_method === 'string'
          ? paymentIntent.payment_method
          : paymentIntent.payment_method?.id;

      let cardBrand: string | undefined;
      let cardLast4: string | undefined;
      let cardExpMonth: number | undefined;
      let cardExpYear: number | undefined;

      if (!paymentMethodId) {
        const latestChargeId =
          typeof paymentIntent.latest_charge === 'string'
            ? paymentIntent.latest_charge
            : paymentIntent.latest_charge?.id;
        if (latestChargeId) {
          try {
            const charge = await this.stripe.charges.retrieve(latestChargeId);
            const chargePaymentMethod = charge.payment_method;
            if (typeof chargePaymentMethod === 'string') {
              paymentMethodId = chargePaymentMethod;
            } else if (chargePaymentMethod) {
              const candidate = (chargePaymentMethod as Stripe.PaymentMethod)
                .id;
              if (typeof candidate === 'string' && candidate.length > 0) {
                paymentMethodId = candidate;
              }
            }
            const chargeCard = charge.payment_method_details?.card;
            if (chargeCard) {
              cardBrand = chargeCard.brand || cardBrand;
              cardLast4 = chargeCard.last4 || cardLast4;
              cardExpMonth = chargeCard.exp_month || cardExpMonth;
              cardExpYear = chargeCard.exp_year || cardExpYear;
            }
          } catch (error) {
            console.warn(
              '[PaymentService] Unable to retrieve charge details for payment intent',
              paymentIntent.id,
              (error as Error)?.message || error,
            );
          }
        }
      }

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

        if (!cardBrand || !cardLast4 || !cardExpMonth || !cardExpYear) {
          try {
            const paymentMethod =
              await this.stripe.paymentMethods.retrieve(paymentMethodId);
            const methodCard = paymentMethod?.card;
            if (methodCard) {
              cardBrand = methodCard.brand || cardBrand;
              cardLast4 = methodCard.last4 || cardLast4;
              cardExpMonth = methodCard.exp_month || cardExpMonth;
              cardExpYear = methodCard.exp_year || cardExpYear;
            }
          } catch (error) {
            console.warn(
              '[PaymentService] Unable to retrieve payment method details',
              (error as Error)?.message || error,
            );
          }
        }

        billingDetails = {
          paymentMethodId,
          cardBrand,
          cardLast4,
          cardExpMonth,
          cardExpYear,
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
        const start = s.currentPeriodStart
          ? new Date(s.currentPeriodStart)
          : null;
        const end = s.currentPeriodEnd ? new Date(s.currentPeriodEnd) : null;
        const hasValidCurrentCycle = !!(
          start &&
          end &&
          start <= now &&
          end > now
        );
        if (!hasValidCurrentCycle) {
          const normStart = now;
          const normEnd = new Date(now.getTime());
          normEnd.setFullYear(normEnd.getFullYear() + 1);
          console.warn(
            '[PaymentService] Normalizing subscription period post-payment',
            {
              userId: userId?.toString?.() || userId,
              prevStart: start,
              prevEnd: end,
              normStart,
              normEnd,
            },
          );
          user = await this.usersService.normalizeSubscription(
            userId,
            normStart,
            normEnd,
          );
        }
      } catch (e) {
        console.warn(
          '[PaymentService] normalize guard failed (non-fatal):',
          e?.message || e,
        );
      }

      // Append payment history
      // Persist to separate payment history collection
      const periodStart = user?.subscription?.currentPeriodStart
        ? new Date(user.subscription.currentPeriodStart)
        : undefined;
      const periodEnd = user?.subscription?.currentPeriodEnd
        ? new Date(user.subscription.currentPeriodEnd)
        : undefined;
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
      console.error(
        '[PaymentService] confirmPayment error:',
        error?.message || error,
      );
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

  async createSetupIntent(userId: string): Promise<{ clientSecret: string }> {
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

    const paymentMethod =
      await this.stripe.paymentMethods.retrieve(paymentMethodId);
    const billingDetails = this.buildBillingDetails(paymentMethod) || {
      paymentMethodId,
      cardBrand: undefined,
      cardLast4: undefined,
      cardExpMonth: undefined,
      cardExpYear: undefined,
    };

    await this.usersService.updateBillingDetails(userId, billingDetails);

    if (previousMethodId && previousMethodId !== paymentMethodId) {
      try {
        await this.stripe.paymentMethods.detach(previousMethodId);
      } catch (error) {
        console.warn(
          '[PaymentService] Failed to detach previous payment method',
          { previousMethodId, error: error?.message || error },
        );
      }
    }

    let subscriptionUpdate: User['subscription'] | undefined;
    let autoChargeFailed = false;

    if (user.stripeSubscriptionId) {
      const updatedSubscription = (await this.stripe.subscriptions.update(
        user.stripeSubscriptionId,
        {
          default_payment_method: paymentMethodId,
          payment_settings: {
            save_default_payment_method: 'on_subscription',
          },
          expand: Array.from(this.invoiceExpandParams),
        },
      )) as StripeSubscriptionExpanded;

      const updatedUser = await this.usersService.updateSubscriptionFromStripe(
        userId,
        {
          subscriptionId: updatedSubscription.id,
          status: this.normalizeSubscriptionStatus(updatedSubscription.status),
          currentPeriodStart: updatedSubscription.current_period_start
            ? new Date(updatedSubscription.current_period_start * 1000)
            : undefined,
          currentPeriodEnd: updatedSubscription.current_period_end
            ? new Date(updatedSubscription.current_period_end * 1000)
            : undefined,
          cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end || false,
        },
        billingDetails,
      );

      subscriptionUpdate = updatedUser?.subscription;
      autoChargeFailed = ['past_due', 'unpaid'].includes(
        updatedUser?.subscription?.status as string,
      );

      if (autoChargeFailed) {
        try {
          const latestInvoiceRaw = updatedSubscription.latest_invoice as
            | string
            | StripeInvoiceExpanded
            | undefined;
          if (latestInvoiceRaw) {
            const latestInvoice =
              typeof latestInvoiceRaw === 'string'
                ? ((await this.stripe.invoices.retrieve(
                    latestInvoiceRaw,
                  )) as StripeInvoiceExpanded)
                : latestInvoiceRaw;
            if (latestInvoice && !latestInvoice.paid && latestInvoice.id) {
              await this.stripe.invoices.pay(latestInvoice.id, {
                payment_method: paymentMethodId,
              });
            }
          }
        } catch (error) {
          console.warn(
            '[PaymentService] Unable to auto-pay latest invoice after card update',
            (error as Error)?.message || error,
          );
        }
      }
    }

    return {
      success: true,
      billing: {
        defaultPaymentMethodId: billingDetails.paymentMethodId,
        cardBrand: billingDetails.cardBrand || null,
        cardLast4: billingDetails.cardLast4 || null,
        expMonth: billingDetails.cardExpMonth || null,
        expYear: billingDetails.cardExpYear || null,
      },
      subscription: subscriptionUpdate,
      autoChargeFailed,
    };
  }

  // Validates coupon code and availability
  private async validateCoupon(code: string): Promise<Coupon> {
    const normalizedCode = code.trim().toUpperCase();
    const coupon = await this.couponModel.findOne({ 
      code: { $regex: new RegExp(`^${normalizedCode}$`, 'i') }, 
      isActive: true 
    });

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

  async createCoupon(dto: CreateCouponDto) {
    const code = dto.code.trim().toUpperCase();
    if (!code) {
      throw new BadRequestException('Coupon code is required');
    }

    const existing = await this.couponModel.findOne({ code });
    if (existing) {
      throw new BadRequestException('Coupon code already exists');
    }

    const percentage = Math.round(dto.discountPercentage);
    if (Number.isNaN(percentage)) {
      throw new BadRequestException('Discount percentage is required');
    }
    if (percentage < 1 || percentage > 100) {
      throw new BadRequestException(
        'Discount percentage must be between 1 and 100',
      );
    }

    const expiresAt = this.resolveExpirationDate(
      dto.expiresAt,
      dto.expiresDate,
      dto.expiresTime,
    );

    const coupon = new this.couponModel({
      code,
      type: 'percentage',
      value: percentage,
      isActive: true,
      usageLimit: dto.usageLimit,
      expiresAt,
    });

    const saved = await coupon.save();
    return saved.toObject();
  }

  async listCoupons() {
    return this.couponModel
      .find()
      .sort({ createdAt: -1 })
      .select('-__v')
      .lean();
  }

  async extendCouponUsage(code: string, dto: ExtendCouponUsageDto) {
    const normalizedCode = code.trim().toUpperCase();
    const coupon = await this.couponModel.findOne({ code: normalizedCode });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    const hasUsageUpdate = dto.additionalUses || dto.newTotalLimit;
    const hasExpirationUpdate =
      dto.newExpirationDate !== undefined ||
      dto.newExpirationTime !== undefined ||
      dto.newExpirationDateTime !== undefined ||
      dto.clearExpiration;
    if (!hasUsageUpdate && !hasExpirationUpdate) {
      throw new BadRequestException(
        'Please provide additionalUses, newTotalLimit, newExpirationDate/newExpirationTime, newExpirationDateTime, or clearExpiration to update the coupon.',
      );
    }

    if (dto.newTotalLimit !== undefined) {
      if (dto.newTotalLimit <= coupon.usedCount) {
        throw new BadRequestException(
          `New total limit must be greater than the number of times already used (${coupon.usedCount}).`,
        );
      }
      coupon.usageLimit = dto.newTotalLimit;
    } else if (dto.additionalUses !== undefined) {
      const currentLimit = coupon.usageLimit ?? coupon.usedCount;
      coupon.usageLimit = currentLimit + dto.additionalUses;
    }

    if (
      dto.newExpirationDateTime ||
      dto.newExpirationDate ||
      dto.newExpirationTime
    ) {
      const updatedExpiration = this.resolveExpirationDate(
        dto.newExpirationDateTime,
        dto.newExpirationDate,
        dto.newExpirationTime,
      );

      coupon.expiresAt = updatedExpiration;
    }

    if (dto.clearExpiration) {
      coupon.expiresAt = undefined;
    }

    await coupon.save();
    return coupon.toObject();
  }

  async deleteCoupon(code: string) {
    const normalizedCode = code.trim().toUpperCase();
    const coupon = await this.couponModel.findOneAndDelete({
      code: normalizedCode,
    });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    if (coupon.type !== 'free_trial') {
      const couponId = `advisor_${normalizedCode.toLowerCase()}`;
      try {
        await this.stripe.coupons.del(couponId);
      } catch (error: any) {
        if (error?.statusCode !== 404) {
          this.logger.warn(
            `[PaymentService] Unable to delete Stripe coupon ${couponId}: ${
              error?.message || error
            }`,
          );
        }
      }
    }

    return {
      message: 'Coupon deleted successfully',
      code: coupon.code,
    };
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

        if (
          paymentIntent.metadata?.userId &&
          paymentIntent.metadata?.subscriptionId
        ) {
          await this.usersService.updateSubscriptionFromStripe(
            paymentIntent.metadata.userId,
            {
              subscriptionId: paymentIntent.metadata.subscriptionId,
              status: 'active',
            },
          );
          console.log(
            `User ${paymentIntent.metadata.userId} marked as payment verified`,
          );
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await this.handleStripeSubscriptionEvent(subscription);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as StripeInvoiceExpanded;
        const billingReason = invoice.billing_reason;
        const paymentIntentSource = invoice.payment_intent;
        const paymentIntentId =
          typeof paymentIntentSource === 'string'
            ? paymentIntentSource
            : paymentIntentSource?.id;

        let userId = invoice.metadata?.userId;
        if (!userId && paymentIntentId) {
          try {
            const intent =
              await this.stripe.paymentIntents.retrieve(paymentIntentId);
            userId = intent.metadata?.userId;
          } catch (error) {
            console.warn(
              '[PaymentService] Unable to retrieve PaymentIntent for invoice.payment_succeeded',
              paymentIntentId,
              (error as Error)?.message || error,
            );
          }
        }

        if (userId && invoice.subscription) {
          try {
            const subscription = (await this.stripe.subscriptions.retrieve(
              invoice.subscription as string,
              { expand: Array.from(this.invoiceExpandParams) },
            )) as StripeSubscriptionExpanded;
            await this.handleStripeSubscriptionEvent(subscription);
            await this.recordPaymentHistoryFromSubscription(
              userId,
              subscription,
              undefined,
            );
            await this.incrementCouponUsage(subscription.metadata?.couponCode);
          } catch (error) {
            console.warn(
              '[PaymentService] Unable to update user after invoice success',
              (error as Error)?.message || error,
            );
          }
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as StripeInvoiceExpanded;
        const paymentIntentSource = invoice.payment_intent;
        const paymentIntentId =
          typeof paymentIntentSource === 'string'
            ? paymentIntentSource
            : paymentIntentSource?.id;

        let userId = invoice.metadata?.userId;
        let failureReason: string | undefined;
        if (!userId && paymentIntentId) {
          try {
            const intent =
              await this.stripe.paymentIntents.retrieve(paymentIntentId);
            userId = intent.metadata?.userId;
            failureReason = intent.last_payment_error?.message;
          } catch (error) {
            console.warn(
              '[PaymentService] Unable to retrieve PaymentIntent for invoice.payment_failed',
              paymentIntentId,
              (error as Error)?.message || error,
            );
          }
        }
        
        // Auto-retry payment with updated payment method
        if (userId && invoice.subscription) {
          try {
            const user = await this.usersService.findById(userId);
            if (user?.billing?.defaultPaymentMethodId && invoice.id) {
              console.log(`[PaymentService] Attempting auto-retry for user ${userId}`);
              await this.stripe.invoices.pay(invoice.id, {
                payment_method: user.billing.defaultPaymentMethodId,
              });
              console.log(`[PaymentService] Auto-retry successful for user ${userId}`);
              return { received: true };
            }
          } catch (retryError) {
            console.error(`[PaymentService] Auto-retry failed for user ${userId}:`, retryError);
          }
        }
        if (userId) {
          let subscriptionId =
            typeof invoice.subscription === 'string'
              ? invoice.subscription
              : undefined;

          let userRecord: User | null = null;

          if (!subscriptionId) {
            try {
              userRecord = await this.usersService.findById(userId);
              subscriptionId = userRecord?.stripeSubscriptionId;
            } catch (error) {
              console.warn(
                '[PaymentService] Unable to fetch user while handling invoice.payment_failed',
                (error as Error)?.message || error,
              );
            }
          }

          await this.usersService.updateSubscriptionFromStripe(userId, {
            subscriptionId: subscriptionId || '',
            status: 'past_due',
          });

          const failurePaymentId = paymentIntentId || `invoice-${invoice.id}`;
          const exists = await this.paymentHistoryModel.exists({
            paymentId: failurePaymentId,
          });

          if (!exists) {
            await this.paymentHistoryModel.create({
              userId,
              provider: 'stripe',
              paymentId: failurePaymentId,
              amount: invoice.amount_due || 0,
              currency: invoice.currency || 'usd',
              status: 'failed',
              description: 'Automatic renewal failed (webhook)',
              periodStart: invoice.period_start
                ? new Date(invoice.period_start * 1000)
                : undefined,
              periodEnd: invoice.period_end
                ? new Date(invoice.period_end * 1000)
                : undefined,
              metadata: {
                invoiceId: invoice.id,
                code: invoice.status,
                reason: failureReason,
              },
            });
          }

          if (!userRecord) {
            try {
              userRecord = await this.usersService.findById(userId);
            } catch (error) {
              const reason = (error as Error)?.message || String(error);
              this.logger.warn(
                `[PaymentService] Unable to load user record for payment failure email: ${reason}`,
              );
            }
          }

          if (userRecord) {
            try {
              const frontendUrl =
                this.configService.get<string>('FRONTEND_URL') ||
                'http://localhost:5174';
              const attemptDate = new Date(
                (invoice.created || Math.floor(Date.now() / 1000)) * 1000,
              ).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              });
              await this.emailService.sendPaymentFailedEmail({
                email: userRecord.email,
                advisorName: userRecord.name || 'there',
                planLabel: 'Advisor Chooser membership',
                attemptDate,
                ctaUrl: `${frontendUrl.replace(/\/$/, '')}/advisor-change-card`,
                failureReason,
              });
            } catch (error) {
              const reason = (error as Error)?.message || String(error);
              this.logger.warn(
                `[PaymentService] Unable to send payment failure email: ${reason}`,
              );
            }
          }
        }
        break;
      }
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    return { received: true };
  }

  async getHistory(userId: string) {
    const items = await this.paymentHistoryModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean();
    return { paymentHistory: items };
  }

  async cancelAtPeriodEnd(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Cancel the Stripe subscription at period end if it exists
    if (user.stripeSubscriptionId) {
      try {
        await this.stripe.subscriptions.update(user.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
        console.log(`[PaymentService] Stripe subscription ${user.stripeSubscriptionId} set to cancel at period end`);
      } catch (error) {
        console.error(`[PaymentService] Failed to cancel Stripe subscription:`, error);
        // Continue with local cancellation even if Stripe fails
      }
    }

    // Update local subscription status
    const updatedUser = await this.usersService.cancelSubscriptionAtPeriodEnd(userId);
    return { subscription: updatedUser?.subscription };
  }

  async resume(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Resume the Stripe subscription if it exists
    if (user.stripeSubscriptionId) {
      try {
        await this.stripe.subscriptions.update(user.stripeSubscriptionId, {
          cancel_at_period_end: false,
        });
        console.log(`[PaymentService] Stripe subscription ${user.stripeSubscriptionId} resumed`);
      } catch (error) {
        console.error(`[PaymentService] Failed to resume Stripe subscription:`, error);
        // Continue with local resumption even if Stripe fails
      }
    }

    // Update local subscription status
    const updatedUser = await this.usersService.resumeSubscription(userId);
    return { subscription: updatedUser?.subscription };
  }

  async renewSubscription(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.billing?.defaultPaymentMethodId) {
      throw new BadRequestException('No payment method available for renewal');
    }

    if (!user.stripeSubscriptionId) {
      throw new BadRequestException('No active subscription found');
    }

    try {
      // Get the current subscription
      const subscription = await this.stripe.subscriptions.retrieve(
        user.stripeSubscriptionId,
        { expand: ['latest_invoice'] }
      );

      // If there's an unpaid invoice, try to pay it
      const latestInvoice = subscription.latest_invoice as any;
      if (latestInvoice && !latestInvoice.paid) {
        await this.stripe.invoices.pay(latestInvoice.id, {
          payment_method: user.billing.defaultPaymentMethodId,
        });
      }

      // Update the subscription to ensure it's active
      const updatedSubscription = await this.stripe.subscriptions.update(
        user.stripeSubscriptionId,
        {
          default_payment_method: user.billing.defaultPaymentMethodId,
          cancel_at_period_end: false,
        }
      );

      // Update user subscription status
      await this.usersService.updateSubscriptionFromStripe(userId, {
        subscriptionId: updatedSubscription.id,
        status: this.normalizeSubscriptionStatus(updatedSubscription.status),
        currentPeriodStart: (updatedSubscription as any).current_period_start
          ? new Date((updatedSubscription as any).current_period_start * 1000)
          : undefined,
        currentPeriodEnd: (updatedSubscription as any).current_period_end
          ? new Date((updatedSubscription as any).current_period_end * 1000)
          : undefined,
        cancelAtPeriodEnd: false,
      });

      console.log(`[PaymentService] Successfully renewed subscription for user ${userId}`);
    } catch (error) {
      console.error(`[PaymentService] Renewal failed for user ${userId}:`, error);
      throw error;
    }
  }
}
