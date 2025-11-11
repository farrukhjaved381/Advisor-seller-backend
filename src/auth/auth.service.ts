import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { EmailService } from './email.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginUserDto } from '../users/dto/login-user.dto';
import { User, UserRole } from '../users/schemas/user.schema';
import { AdvisorsService } from '../advisors/advisors.service';
import { SellersService } from '../sellers/sellers.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    isEmailVerified: boolean;
    isPaymentVerified: boolean;
    isProfileComplete?: boolean;
    isSubscriptionActive?: boolean;
    subscription?: any;
    billing?: any;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private emailService: EmailService,
    @Inject(forwardRef(() => AdvisorsService))
    private advisorsService: AdvisorsService,
    private sellersService: SellersService,
  ) {}

  async register(createUserDto: CreateUserDto): Promise<AuthResponse> {
    const user = await this.usersService.create(createUserDto);

    // Generate verification token and send email
    const verificationToken = this.jwtService.sign(
      {
        sub: (user as any)._id.toString(),
        type: 'email_verification',
        role: user.role,
      },
      { expiresIn: '24h' },
    );

    try {
      await this.emailService.sendVerificationEmail(
        user.email,
        user.name,
        verificationToken,
        user.role,
      );
      console.log(`Verification email sent to ${user.email}`);
    } catch (error) {
      console.error('Failed to send verification email:', error);
      // Don't throw error - allow registration to complete
    }

    // We no longer create empty advisor profiles automatically
    // The profile will be created when the user first accesses their profile

    return this.generateAuthResponse(user);
  }

  async login(loginUserDto: LoginUserDto): Promise<AuthResponse> {
    const user = await this.validateUser(
      loginUserDto.email,
      loginUserDto.password,
    );

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'We previously sent you a verification email, check you spam.  Request a new verification email(link)',
      );
    }

    // We no longer create empty advisor profiles automatically during login
    // The profile will be created when the user first accesses their profile

    return this.generateAuthResponse(user);
  }

  async sellerLoginByEmail(email: string): Promise<AuthResponse> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException('Email is required');
    }

    console.log('[AuthService] sellerLoginByEmail start', { normalizedEmail });
    let user = await this.usersService.findByEmail(normalizedEmail);

    if (user && user.role !== UserRole.SELLER) {
      throw new BadRequestException(
        'Email is registered for a different user type',
      );
    }

    if (!user) {
      console.log(
        '[AuthService] No user found, creating new seller for email',
        normalizedEmail,
      );
      user = await this.usersService.createSellerFromEmail(normalizedEmail);
    } else if (!user.isEmailVerified) {
      console.log(
        '[AuthService] Existing seller found but email not verified, marking verified',
        normalizedEmail,
      );
      user = await this.usersService.verifyEmail((user as any)._id.toString());
    }

    console.log('[AuthService] sellerLoginByEmail issuing tokens for user', {
      userId: (user as any)._id?.toString?.(),
      role: user.role,
    });
    return this.generateAuthResponse(user);
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    const user = await this.usersService.findByRefreshToken(refreshToken);
    if (
      !user ||
      !user.refreshTokenExpiry ||
      user.refreshTokenExpiry < new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return this.generateAuthResponse(user);
  }

  async verifyEmail(token: string): Promise<{
    message: string;
    success: boolean;
    user?: {
      id: string;
      name: string;
      email: string;
      role: string;
      isEmailVerified: boolean;
      isPaymentVerified: boolean;
      isProfileComplete?: boolean;
    };
  }> {
    try {
      const payload = this.jwtService.verify(token);

      if (payload.type !== 'email_verification') {
        throw new BadRequestException('Invalid verification token');
      }

      const verifiedUser = await this.usersService.verifyEmail(payload.sub);

      return {
        message: 'Email verified successfully! You can now login.',
        success: true,
        user: {
          id: (verifiedUser as any)._id.toString(),
          name: verifiedUser.name,
          email: verifiedUser.email,
          role: verifiedUser.role,
          isEmailVerified: verifiedUser.isEmailVerified,
          isPaymentVerified: verifiedUser.isPaymentVerified,
          isProfileComplete: verifiedUser.isProfileComplete,
        },
      };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new BadRequestException('Verification token has expired');
      }
      throw new BadRequestException('Invalid verification token');
    }
  }

  async forgotPassword(
    email: string,
  ): Promise<{ message: string; success: boolean }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists or not for security
      return {
        message: 'If email exists, password reset link has been sent.',
        success: true,
      };
    }

    const resetToken = this.jwtService.sign(
      { sub: (user as any)._id.toString(), type: 'password_reset' },
      { expiresIn: '1h' },
    );

    await this.usersService.saveResetPasswordToken(
      (user as any)._id.toString(),
      resetToken,
    );

    try {
      await this.emailService.sendPasswordResetEmail(
        user.email,
        user.name,
        resetToken,
      );
    } catch (error) {
      console.error('Failed to send password reset email:', error);
    }

    return {
      message: 'If email exists, password reset link has been sent.',
      success: true,
    };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string; success: boolean }> {
    try {
      const payload = this.jwtService.verify(token);

      if (payload.type !== 'password_reset') {
        throw new BadRequestException('Invalid reset token');
      }

      const user = await this.usersService.findById(payload.sub);
      if (!user || user.resetPasswordToken !== token) {
        throw new BadRequestException('Invalid or expired reset token');
      }

      await this.usersService.updatePassword(payload.sub, newPassword);
      await this.usersService.clearResetPasswordToken(payload.sub);

      return {
        message: 'Password reset successfully! You can now login.',
        success: true,
      };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new BadRequestException('Reset token has expired');
      }
      throw new BadRequestException('Invalid reset token');
    }
  }

  async resendVerificationEmail(
    email: string,
  ): Promise<{ message: string; success: boolean }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return {
        message:
          'If email exists and is unverified, verification email has been sent.',
        success: true,
      };
    }

    if (user.isEmailVerified) {
      return { message: 'Email is already verified.', success: true };
    }

    const verificationToken = this.jwtService.sign(
      {
        sub: (user as any)._id.toString(),
        type: 'email_verification',
        role: user.role,
      },
      { expiresIn: '24h' },
    );

    try {
      await this.emailService.sendVerificationEmail(
        user.email,
        user.name,
        verificationToken,
        user.role,
      );
    } catch (error) {
      console.error('Failed to resend verification email:', error);
    }

    return {
      message:
        'If email exists and is unverified, verification email has been sent.',
      success: true,
    };
  }

  async loginWithToken(token: string): Promise<AuthResponse> {
    try {
      const payload = this.jwtService.verify(token);

      if (payload.type !== 'email_verification') {
        throw new BadRequestException('Invalid verification token');
      }

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return this.generateAuthResponse(user);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new BadRequestException('Verification token has expired');
      }
      throw new BadRequestException('Invalid verification token');
    }
  }

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Account not found. Please create an account first.');
    }

    const isPasswordValid = await this.usersService.validatePassword(
      password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Incorrect password');
    }

    return user;
  }

  private async generateAuthResponse(user: User): Promise<AuthResponse> {
    // Re-fetch the user to ensure we have the latest isProfileComplete status
    const latestUser = await this.usersService.findById(
      (user as any)._id.toString(),
    );
    if (!latestUser) {
      throw new UnauthorizedException(
        'User not found during auth response generation',
      );
    }

    const payload: JwtPayload = {
      sub: (latestUser as any)._id.toString(),
      email: latestUser.email,
      role: latestUser.role,
    };

    // Generate access token (24 hour)
    const accessToken = this.jwtService.sign(payload, { expiresIn: '24h' });

    // Generate refresh token (7 days)
    const refreshToken = this.jwtService.sign(
      { sub: (latestUser as any)._id.toString(), type: 'refresh' },
      { expiresIn: '7d' },
    );

    // Save refresh token to database
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7);

    await this.usersService.updateRefreshToken(
      (latestUser as any)._id.toString(),
      refreshToken,
      refreshTokenExpiry,
    );

    let isProfileComplete = !!latestUser.isProfileComplete;
    if (latestUser.role === UserRole.ADVISOR) {
      const advisorProfile = await this.advisorsService.getProfileByUserId(
        (latestUser as any)._id.toString(),
      );
      isProfileComplete = !!advisorProfile;
    } else if (latestUser.role === UserRole.SELLER) {
      const sellerProfile = await this.sellersService.getProfileByUserId(
        (latestUser as any)._id.toString(),
      );
      const hasProfile = !!sellerProfile;

      if (hasProfile && !isProfileComplete) {
        await this.usersService.updateProfileComplete(
          (latestUser as any)._id.toString(),
          true,
        );
      }

      if (!hasProfile && isProfileComplete) {
        await this.usersService.updateProfileComplete(
          (latestUser as any)._id.toString(),
          false,
        );
      }

      isProfileComplete = hasProfile;
    }

    const subscription = latestUser.subscription || { status: 'none' };
    const subscriptionStatus = String(subscription.status || '').toLowerCase();
    let isSubscriptionActive = false;
    if (['active', 'trialing'].includes(subscriptionStatus)) {
      const end = subscription.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd)
        : null;
      if (end && end.getTime() > Date.now()) {
        isSubscriptionActive = true;
      }
    }

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: (latestUser as any)._id.toString(),
        name: latestUser.name,
        email: latestUser.email,
        role: latestUser.role,
        isEmailVerified: latestUser.isEmailVerified,
        isPaymentVerified: latestUser.isPaymentVerified,
        isProfileComplete,
        subscription,
        isSubscriptionActive,
        billing: latestUser.billing || null,
      },
    };
  }
}

