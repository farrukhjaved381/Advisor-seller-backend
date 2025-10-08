import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { User, UserRole } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingUser = await this.userModel.findOne({
      email: createUserDto.email,
    });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(
      createUserDto.password,
      saltRounds,
    );

    const user = new this.userModel({
      ...createUserDto,
      password: hashedPassword,
    });

    return user.save();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email: email.toLowerCase() });
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id);
  }

  async verifyEmail(userId: string): Promise<User> {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      {
        isEmailVerified: true,
        $unset: { emailVerificationToken: 1, emailVerificationExpires: 1 },
      },
      { new: true },
    );

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async validatePassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  async updateRefreshToken(
    userId: string,
    refreshToken: string,
    expiry: Date,
  ): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      refreshToken,
      refreshTokenExpiry: expiry,
    });
  }

  async findByRefreshToken(refreshToken: string): Promise<User | null> {
    return this.userModel.findOne({ refreshToken });
  }

  async clearRefreshToken(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $unset: { refreshToken: 1, refreshTokenExpiry: 1 },
    });
  }

  async saveResetPasswordToken(userId: string, token: string): Promise<void> {
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 1); // 1 hour expiry

    await this.userModel.findByIdAndUpdate(userId, {
      resetPasswordToken: token,
      resetPasswordExpiry: expiry,
    });
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.userModel.findByIdAndUpdate(userId, {
      password: hashedPassword,
    });
  }

  async clearResetPasswordToken(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $unset: { resetPasswordToken: 1, resetPasswordExpiry: 1 },
    });
  }

  async markPaymentVerified(
    userId: string,
    stripeCustomerId?: string,
    billingDetails?: {
      paymentMethodId?: string;
      cardBrand?: string;
      cardLast4?: string;
      cardExpMonth?: number;
      cardExpYear?: number;
    },
  ): Promise<User | null> {
    const existing = await this.userModel.findById(userId);
    const now = new Date();
    const alreadyVerified = !!existing?.isPaymentVerified;
    const existingStart = existing?.subscription?.currentPeriodStart
      ? new Date(existing.subscription.currentPeriodStart)
      : null;
    const existingEnd = existing?.subscription?.currentPeriodEnd
      ? new Date(existing.subscription.currentPeriodEnd)
      : null;

    // Determine if there is a valid current cycle (start <= now < end)
    const hasValidCurrentCycle = !!(
      existingStart &&
      existingEnd &&
      existingStart <= now &&
      existingEnd > now
    );
    // New rule:
    // - If there is a valid current cycle, renew from existingEnd.
    // - Otherwise (no cycle, expired, or anomalous future-only window), start from now.
    const startFrom = hasValidCurrentCycle ? existingEnd : now;

    const periodStart = startFrom;
    const periodEnd = new Date(startFrom.getTime());
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    console.log('[UsersService] markPaymentVerified', {
      userId: userId?.toString?.() || userId,
      alreadyVerified,
      existingStart,
      existingEnd,
      now,
      chosenStartFrom: startFrom,
      computedPeriodStart: periodStart,
      computedPeriodEnd: periodEnd,
    });

    const updateData: any = {
      isPaymentVerified: true,
      subscription: {
        status: 'active',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
    };
    if (stripeCustomerId) {
      updateData.stripeCustomerId = stripeCustomerId;
    }
    if (billingDetails && billingDetails.paymentMethodId) {
      updateData.billing = {
        defaultPaymentMethodId: billingDetails.paymentMethodId,
        cardBrand: billingDetails.cardBrand,
        cardLast4: billingDetails.cardLast4,
        expMonth: billingDetails.cardExpMonth,
        expYear: billingDetails.cardExpYear,
        updatedAt: new Date(),
      };
    }
    const updated = await this.userModel.findByIdAndUpdate(userId, updateData, {
      new: true,
    });
    try {
      console.log('[UsersService] markPaymentVerified updated subscription', {
        userId: userId?.toString?.() || userId,
        updatedStart: updated?.subscription?.currentPeriodStart,
        updatedEnd: updated?.subscription?.currentPeriodEnd,
        status: updated?.subscription?.status,
      });
    } catch {}
    return updated;
  }

  async appendPaymentHistory(
    userId: string,
    record: {
      id: string;
      amount: number;
      currency: string;
      status: string;
      description?: string;
      provider?: string;
    },
  ): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(
      userId,
      { $push: { paymentHistory: { ...record, createdAt: new Date() } } },
      { new: true },
    );
  }

  async setStripeCustomerId(
    userId: string,
    customerId: string,
  ): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(
      userId,
      { stripeCustomerId: customerId },
      { new: true },
    );
  }

  async updateBillingDetails(
    userId: string,
    details: {
      paymentMethodId?: string;
      cardBrand?: string;
      cardLast4?: string;
      cardExpMonth?: number;
      cardExpYear?: number;
    },
  ): Promise<User | null> {
    const billing = {
      defaultPaymentMethodId: details.paymentMethodId,
      cardBrand: details.cardBrand,
      cardLast4: details.cardLast4,
      expMonth: details.cardExpMonth,
      expYear: details.cardExpYear,
      updatedAt: new Date(),
    };
    return this.userModel.findByIdAndUpdate(userId, { billing }, { new: true });
  }

  async updateSubscriptionFromStripe(
    userId: string,
    details: {
      subscriptionId: string;
      status: string;
      currentPeriodStart?: Date;
      currentPeriodEnd?: Date;
      cancelAtPeriodEnd?: boolean;
      couponCode?: string;
    },
    billingDetails?: {
      paymentMethodId?: string;
      cardBrand?: string;
      cardLast4?: string;
      cardExpMonth?: number;
      cardExpYear?: number;
    },
  ): Promise<User | null> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const subscription = user.subscription || ({} as any);
    subscription.status = details.status as any;
    if (details.currentPeriodStart) {
      subscription.currentPeriodStart = details.currentPeriodStart;
    }
    if (details.currentPeriodEnd) {
      subscription.currentPeriodEnd = details.currentPeriodEnd;
    }
    if (typeof details.cancelAtPeriodEnd === 'boolean') {
      subscription.cancelAtPeriodEnd = details.cancelAtPeriodEnd;
    }

    if (['active', 'trialing'].includes(details.status)) {
      delete subscription.expiryNotifiedAt;
      delete subscription.lastAutoRenewAttempt;
    }

    // Determine if payment should remain verified
    // For canceled subscriptions, keep verification until the period actually ends
    let shouldBeVerified = ['active', 'trialing'].includes(details.status);
    
    if (details.status === 'canceled' && details.currentPeriodEnd) {
      const periodEnd = new Date(details.currentPeriodEnd);
      const now = new Date();
      // Keep verified if the period hasn't ended yet
      shouldBeVerified = periodEnd.getTime() > now.getTime();
    }

    const updateData: any = {
      subscription,
      isPaymentVerified: shouldBeVerified,
    };

    if (details.subscriptionId) {
      updateData.stripeSubscriptionId = details.subscriptionId;
    }

    if (billingDetails && billingDetails.paymentMethodId) {
      updateData.billing = {
        defaultPaymentMethodId: billingDetails.paymentMethodId,
        cardBrand: billingDetails.cardBrand,
        cardLast4: billingDetails.cardLast4,
        expMonth: billingDetails.cardExpMonth,
        expYear: billingDetails.cardExpYear,
        updatedAt: new Date(),
      };
    }

    return this.userModel.findByIdAndUpdate(userId, updateData, {
      new: true,
    });
  }

  async findAdvisorsDueForRenewal(cutoff: Date): Promise<User[]> {
    return this.userModel
      .find({
        role: UserRole.ADVISOR,
        'subscription.status': { $in: ['active', 'past_due'] },
        'subscription.currentPeriodEnd': { $lte: cutoff },
        stripeCustomerId: { $exists: true, $ne: null },
        'billing.defaultPaymentMethodId': { $exists: true, $ne: null },
        $and: [
          {
            $or: [
              { 'subscription.cancelAtPeriodEnd': { $exists: false } },
              { 'subscription.cancelAtPeriodEnd': false },
            ],
          },
          {
            $or: [
              { 'subscription.lastAutoRenewAttempt': { $exists: false } },
              {
                'subscription.lastAutoRenewAttempt': {
                  $lte: new Date(cutoff.getTime() - 12 * 60 * 60 * 1000),
                },
              },
            ],
          },
        ],
      })
      .limit(200)
      .exec();
  }

  async recordAutoRenewAttempt(
    userId: string,
    attemptDate: Date,
  ): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $set: { 'subscription.lastAutoRenewAttempt': attemptDate },
    });
  }

  async markSubscriptionStatus(
    userId: string,
    status: 'expired' | 'past_due',
    options: { expiryNotifiedAt?: Date } = {},
  ): Promise<User | null> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      return null;
    }
    const subscription = user.subscription || ({} as any);
    subscription.status = status;
    if (status === 'expired') {
      subscription.cancelAtPeriodEnd = true;
      if (options.expiryNotifiedAt) {
        subscription.expiryNotifiedAt = options.expiryNotifiedAt;
      }
    }
    return this.userModel.findByIdAndUpdate(
      userId,
      {
        subscription,
        isPaymentVerified: false,
      },
      { new: true },
    );
  }

  async findAdvisorsWithExpiredSubscription(reference: Date): Promise<User[]> {
    return this.userModel
      .find({
        role: UserRole.ADVISOR,
        'subscription.status': { $in: ['active', 'trialing', 'past_due'] },
        'subscription.currentPeriodEnd': { $lte: reference },
        $or: [
          { 'subscription.expiryNotifiedAt': { $exists: false } },
          { 'subscription.expiryNotifiedAt': null },
        ],
      })
      .limit(500)
      .exec();
  }

  async cancelSubscriptionAtPeriodEnd(userId: string): Promise<User | null> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const subscription = user.subscription || ({ status: 'none' } as any);
    if (!subscription.currentPeriodEnd) {
      // Nothing to cancel
      return user;
    }
    subscription.cancelAtPeriodEnd = true;
    subscription.status = 'canceled';
    subscription.canceledAt = new Date();
    // Keep isPaymentVerified true until the subscription actually expires
    const updateData = {
      subscription,
      // Don't change isPaymentVerified here - let it remain true until period ends
    };
    return this.userModel.findByIdAndUpdate(
      userId,
      updateData,
      { new: true },
    );
  }

  async resumeSubscription(userId: string): Promise<User | null> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const subscription = user.subscription || ({} as any);
    const now = new Date();
    if (
      subscription.currentPeriodEnd &&
      new Date(subscription.currentPeriodEnd) > now
    ) {
      subscription.cancelAtPeriodEnd = false;
      subscription.status = 'active';
      delete subscription.canceledAt;
      const updateData = {
        subscription,
        isPaymentVerified: true, // Ensure payment verification is restored
      };
      return this.userModel.findByIdAndUpdate(
        userId,
        updateData,
        { new: true },
      );
    }
    return user; // no-op if already expired
  }

  async getPaymentHistory(userId: string): Promise<{
    subscription?: User['subscription'];
    paymentHistory?: User['paymentHistory'];
  }> {
    const user = await this.userModel.findById(userId).lean();
    if (!user) throw new NotFoundException('User not found');
    return {
      subscription: user.subscription,
      paymentHistory: user.paymentHistory || [],
    };
  }

  // Normalize/override subscription period explicitly
  async normalizeSubscription(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<User | null> {
    console.log('[UsersService] normalizeSubscription', {
      userId: userId?.toString?.() || userId,
      periodStart,
      periodEnd,
    });
    return this.userModel.findByIdAndUpdate(
      userId,
      {
        subscription: {
          status: 'active',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
      },
      { new: true },
    );
  }

  async updateProfileComplete(
    userId: string,
    isComplete: boolean,
  ): Promise<User | null> {
    return this.userModel.findByIdAndUpdate(
      userId,
      { isProfileComplete: isComplete },
      { new: true },
    );
  }

  async createSellerFromEmail(
    email: string,
    fallbackName?: string,
  ): Promise<User> {
    const normalizedEmail = email.toLowerCase();
    const existingUser = await this.userModel.findOne({
      email: normalizedEmail,
    });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const name = fallbackName?.trim() || normalizedEmail;

    const tempPassword = randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const user = new this.userModel({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: UserRole.SELLER,
      isEmailVerified: true,
    });

    return user.save();
  }
}
