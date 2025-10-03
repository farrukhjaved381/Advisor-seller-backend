import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { EmailService } from '../auth/email.service';

@Injectable()
export class PaymentNotificationsService {
  private readonly logger = new Logger(PaymentNotificationsService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async handleExpiredSubscriptions(): Promise<void> {
    const now = new Date();
    const advisors =
      await this.usersService.findAdvisorsWithExpiredSubscription(now);

    if (advisors.length === 0) {
      return;
    }

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      'https://frontend-five-pied-17.vercel.app';
    const ctaUrl = `${frontendUrl.replace(/\/$/, '')}/advisor-payments?intent=reactivate`;

    for (const advisor of advisors) {
      try {
        const subscription = advisor.subscription || ({} as any);
        const expiryDate = subscription.currentPeriodEnd
          ? new Date(subscription.currentPeriodEnd).toLocaleDateString(
              'en-US',
              {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              },
            )
          : new Date().toLocaleDateString('en-US');

        await this.emailService.sendSubscriptionExpiredEmail({
          email: advisor.email,
          advisorName: advisor.name || 'there',
          planLabel: 'Advisor Chooser membership',
          expiryDate,
          ctaUrl,
        });

        await this.usersService.markSubscriptionStatus(
          String(advisor._id),
          'expired',
          {
            expiryNotifiedAt: now,
          },
        );
      } catch (error) {
        this.logger.error(
          `Failed to send subscription expiry notice to advisor ${advisor.email}: ${error?.message || error}`,
        );
      }
    }
  }
}
