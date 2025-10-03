import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { UserRole } from '../../users/schemas/user.schema';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException();
    }

    if (user.role !== UserRole.ADVISOR) {
      return true;
    }

    const freshUser = await this.usersService.findById(user._id);
    if (!freshUser) {
      throw new UnauthorizedException();
    }

    const subscription = freshUser.subscription || {};
    const isActive = this.isSubscriptionActive(subscription);

    if (!isActive) {
      throw new HttpException(
        {
          statusCode: 402,
          message: 'Subscription expired',
          code: 'SUBSCRIPTION_EXPIRED',
        },
        402,
      );
    }

    request.user = { ...user, subscription };
    return true;
  }

  private isSubscriptionActive(subscription: any): boolean {
    if (!subscription) {
      return false;
    }

    const status = (subscription.status || '').toLowerCase();
    if (status === 'active' || status === 'trialing') {
      if (!subscription.currentPeriodEnd) {
        return true;
      }
      const periodEnd = new Date(subscription.currentPeriodEnd);
      return periodEnd.getTime() > Date.now();
    }

    return false;
  }
}
