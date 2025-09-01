import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../users/schemas/user.schema';

@Injectable()
export class PaymentVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Sellers don't need payment verification
    if (user.role === UserRole.SELLER) {
      return true;
    }

    // Advisors need both email and payment verification
    if (user.role === UserRole.ADVISOR) {
      if (!user.isEmailVerified) {
        throw new ForbiddenException('Please verify your email first');
      }
      
      if (!user.isPaymentVerified) {
        throw new ForbiddenException('Please complete payment to access advisor features');
      }
    }

    return true;
  }
}