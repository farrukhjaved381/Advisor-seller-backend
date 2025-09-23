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
  ): Promise<User | null> {
    const existing = await this.userModel.findById(userId);
    const now = new Date();
    const alreadyVerified = !!existing?.isPaymentVerified;
    const existingEnd = existing?.subscription?.currentPeriodEnd
      ? new Date(existing.subscription.currentPeriodEnd)
      : null;

    // First-time payment: always start from now for a clear, correct period
    // Renewal: extend from existing end if still active; otherwise start from now
    const startFrom = !alreadyVerified
      ? now
      : existingEnd && existingEnd > now
        ? existingEnd
        : now;

    const periodStart = startFrom;
    const periodEnd = new Date(startFrom.getTime());
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);

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
    return this.userModel.findByIdAndUpdate(userId, updateData, { new: true });
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

  async cancelSubscriptionAtPeriodEnd(userId: string): Promise<User | null> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const subscription = user.subscription || { status: 'none' } as any;
    if (!subscription.currentPeriodEnd) {
      // Nothing to cancel
      return user;
    }
    subscription.cancelAtPeriodEnd = true;
    subscription.status = 'canceled';
    subscription.canceledAt = new Date();
    return this.userModel.findByIdAndUpdate(
      userId,
      { subscription },
      { new: true },
    );
  }

  async resumeSubscription(userId: string): Promise<User | null> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const subscription = user.subscription || ({} as any);
    const now = new Date();
    if (subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd) > now) {
      subscription.cancelAtPeriodEnd = false;
      subscription.status = 'active';
      delete subscription.canceledAt;
      return this.userModel.findByIdAndUpdate(
        userId,
        { subscription },
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

    const localPart = normalizedEmail.split('@')[0];
    const defaultName =
      localPart.replace(/[^a-zA-Z0-9]/g, ' ').trim() || 'Seller';
    const name = fallbackName?.trim() || defaultName;

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
