import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { User, UserDocument } from '../../users/schemas/user.schema';

@Injectable()
export class PaymentVerifiedGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as UserDocument;

    if (user && user.isPaymentVerified) {
      return true;
    }

    throw new ForbiddenException(
      'Please complete payment to access advisor features',
    );
  }
}
