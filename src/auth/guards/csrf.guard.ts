import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { CsrfService } from '../csrf.service';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private csrfService: CsrfService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Only check CSRF for state-changing operations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return true;
    }

    console.log('CSRF Guard - Headers:', request.headers);
    console.log('CSRF Guard - Cookies:', request.cookies);

    const csrfToken = request.headers['x-csrf-token'];
    const csrfSecret = request.cookies['csrf-secret'];

    console.log('CSRF Token from header:', csrfToken);
    console.log('CSRF Secret from cookie:', csrfSecret);

    if (!csrfToken || !csrfSecret) {
      console.log('CSRF validation failed - missing token or secret');
      throw new ForbiddenException('CSRF token missing');
    }

    if (!this.csrfService.verifyToken(csrfSecret, csrfToken)) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }
}
