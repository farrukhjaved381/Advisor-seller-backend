import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { PaymentService } from './payment.service';

@Injectable()
export class PaymentRetryService {
  private readonly logger = new Logger(PaymentRetryService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private paymentService: PaymentService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredSubscriptions() {
    this.logger.log('Checking for expired subscriptions...');
    
    const now = new Date();
    const expiredUsers = await this.userModel.find({
      role: 'advisor',
      'subscription.currentPeriodEnd': { $lt: now },
      'subscription.status': { $in: ['active', 'past_due'] },
      'billing.defaultPaymentMethodId': { $exists: true },
    });

    this.logger.log(`Found ${expiredUsers.length} expired subscriptions to retry`);

    for (const user of expiredUsers) {
      try {
        await this.attemptRenewal(user);
      } catch (error) {
        this.logger.error(`Failed to renew subscription for user ${user._id}:`, error);
      }
    }
  }

  private async attemptRenewal(user: UserDocument) {
    this.logger.log(`Attempting renewal for user ${user._id}`);
    
    try {
      // Update payment method and trigger renewal
      await this.paymentService.updatePaymentMethod(
        String(user._id),
        user.billing?.defaultPaymentMethodId!,
      );
      
      this.logger.log(`Successfully renewed subscription for user ${user._id}`);
    } catch (error) {
      // Mark subscription as expired and send notification
      await this.userModel.findByIdAndUpdate(user._id, {
        'subscription.status': 'expired',
      });
      
      this.logger.error(`Auto-renewal failed for user ${user._id}:`, error);
      throw error;
    }
  }
}