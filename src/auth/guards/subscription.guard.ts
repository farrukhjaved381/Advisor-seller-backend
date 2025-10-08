import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { PaymentService } from '../../payment/payment.service';
import { UserRole } from '../../users/schemas/user.schema';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly usersService: UsersService,
    private readonly paymentService: PaymentService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException();
    }

    if (user.role !== UserRole.ADVISOR) {
      return true;
    }

    const userId = user._doc?._id || user._id || user.sub || user.id;
    const freshUser = await this.usersService.findById(userId);
    if (!freshUser) {
      throw new UnauthorizedException();
    }

    const subscription = freshUser.subscription || {};
    const isActive = this.isSubscriptionActive(subscription);
    const hasPaymentMethod = !!freshUser.billing?.defaultPaymentMethodId;
    const status = (subscription?.['status'] || '').toLowerCase();
    
    console.log(`[SubscriptionGuard] User ${userId} - Status: ${status}, Active: ${isActive}, PeriodEnd: ${subscription?.['currentPeriodEnd']}, CancelAtPeriodEnd: ${subscription?.['cancelAtPeriodEnd']}`);
    
    // If subscription is active (including canceled but not expired), allow access
    if (isActive) {
      request.user = { ...user, subscription };
      return true;
    }
    
    // For non-canceled expired subscriptions, try auto-renewal
    if (status !== 'canceled' && hasPaymentMethod) {
      try {
        console.log(`[SubscriptionGuard] Attempting auto-renewal for user ${userId}`);
        await this.attemptAutoRenewal(freshUser);
        
        // Refresh user data after renewal attempt
        const renewedUser = await this.usersService.findById(userId);
        if (renewedUser && this.isSubscriptionActive(renewedUser.subscription)) {
          console.log(`[SubscriptionGuard] Auto-renewal successful for user ${userId}`);
          request.user = { ...user, subscription: renewedUser.subscription };
          return true;
        }
      } catch (error) {
        console.error(`[SubscriptionGuard] Auto-renewal failed for user ${userId}:`, error);
      }
    }

    // Block access - subscription is not active
    let message = 'Subscription expired. Please renew to continue access.';
    
    if (status === 'canceled') {
      message = 'Your subscription has ended. Please reactivate to continue access.';
    } else if (hasPaymentMethod) {
      message = 'Subscription expired - payment failed. Please update your payment method.';
    }
    
    throw new HttpException(
      {
        statusCode: 402,
        message,
        code: 'SUBSCRIPTION_EXPIRED',
        hasPaymentMethod,
        redirectTo: '/advisor-payments',
      },
      402,
    );


  }

  private isSubscriptionActive(subscription: any): boolean {
    if (!subscription) {
      return false;
    }

    const status = (subscription?.['status'] || '').toLowerCase();
    
    // Allow access for active, trialing subscriptions
    if (status === 'active' || status === 'trialing') {
      if (!subscription?.['currentPeriodEnd']) {
        return true;
      }
      const periodEnd = new Date(subscription?.['currentPeriodEnd']);
      const isValid = periodEnd.getTime() > Date.now();
      console.log(`[SubscriptionGuard] Active/Trialing check - Status: ${status}, PeriodEnd: ${periodEnd}, Valid: ${isValid}`);
      return isValid;
    }
    
    // Allow access for canceled subscriptions that haven't reached their period end
    if (status === 'canceled' && subscription?.['currentPeriodEnd']) {
      const periodEnd = new Date(subscription?.['currentPeriodEnd']);
      const isValid = periodEnd.getTime() > Date.now();
      console.log(`[SubscriptionGuard] Canceled check - PeriodEnd: ${periodEnd}, Valid: ${isValid}`);
      return isValid;
    }

    console.log(`[SubscriptionGuard] No valid subscription found - Status: ${status}`);
    return false;
  }

  private isSubscriptionExpired(subscription: any): boolean {
    if (!subscription?.['currentPeriodEnd']) {
      return true; // No end date means expired
    }
    
    const periodEnd = new Date(subscription?.['currentPeriodEnd']);
    const status = (subscription?.['status'] || '').toLowerCase();
    
    // For canceled subscriptions, only consider expired if past the period end
    if (status === 'canceled') {
      return periodEnd.getTime() <= Date.now();
    }
    
    return periodEnd.getTime() <= Date.now();
  }

  private async attemptAutoRenewal(user: any): Promise<void> {
    if (!user.billing?.defaultPaymentMethodId) {
      throw new Error('No payment method available for renewal');
    }

    try {
      // Use the payment service to renew subscription
      await this.paymentService.renewSubscription(String(user._id));
    } catch (error) {
      console.error(`Auto-renewal failed for user ${user._id}:`, error);
      throw error;
    }
  }
}
