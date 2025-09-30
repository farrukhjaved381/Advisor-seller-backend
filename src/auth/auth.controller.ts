import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Request,
  Query,
  Res,
  forwardRef,
  Inject,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService, AuthResponse } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginUserDto } from '../users/dto/login-user.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { AuthResponseDto, UserResponseDto } from './dto/auth-response.dto';
import { SellerEmailLoginDto } from './dto/seller-email-login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { CsrfService } from './csrf.service';
import { AdvisorsService } from '../advisors/advisors.service';
import { SellersService } from '../sellers/sellers.service';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private csrfService: CsrfService,
    @Inject(forwardRef(() => AdvisorsService))
    private advisorsService: AdvisorsService,
    private sellersService: SellersService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(@Body() createUserDto: CreateUserDto): Promise<AuthResponse> {
    return this.authService.register(createUserDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged in',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() loginUserDto: LoginUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const authResponse = await this.authService.login(loginUserDto);

    // Set HttpOnly cookies
    res.cookie('access_token', authResponse.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000, // 24h
    });

    res.cookie('refresh_token', authResponse.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Set CSRF token
    const csrfSecret = this.csrfService.generateSecret();
    const csrfToken = this.csrfService.generateToken(csrfSecret);

    res.cookie('csrf-secret', csrfSecret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.cookie('csrf-token', csrfToken, {
      httpOnly: false, // Frontend needs to read this
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return authResponse;
  }

  @Post('seller-login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login or register seller using email only' })
  @ApiResponse({
    status: 200,
    description: 'Seller authenticated successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid email or role mismatch' })
  async sellerLogin(
    @Body() sellerEmailLoginDto: SellerEmailLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    console.log(
      '[AuthController] sellerLogin invoked with email:',
      sellerEmailLoginDto.email,
    );
    const authResponse = await this.authService.sellerLoginByEmail(
      sellerEmailLoginDto.email,
    );

    res.cookie('access_token', authResponse.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.cookie('refresh_token', authResponse.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const csrfSecret = this.csrfService.generateSecret();
    const csrfToken = this.csrfService.generateToken(csrfSecret);

    res.cookie('csrf-secret', csrfSecret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.cookie('csrf-token', csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return authResponse;
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@Request() req) {
    let isProfileComplete = false;
    if (req.user.role === UserRole.ADVISOR) {
      const advisorProfile = await this.advisorsService.getProfileByUserId(
        req.user._id.toString(),
      );
      isProfileComplete = !!advisorProfile;
    } else if (req.user.role === UserRole.SELLER) {
      const sellerProfile = await this.sellersService.getProfileByUserId(
        req.user._id.toString(),
      );
      isProfileComplete = !!sellerProfile;
      if (isProfileComplete && !req.user.isProfileComplete) {
        await this.usersService.updateProfileComplete(
          req.user._id.toString(),
          true,
        );
      }
      if (!isProfileComplete && req.user.isProfileComplete) {
        await this.usersService.updateProfileComplete(
          req.user._id.toString(),
          false,
        );
      }
    }

    // Ensure subscription is initialized for payment-verified legacy users
    try {
      if (
        req.user.isPaymentVerified &&
        (!req.user.subscription || !req.user.subscription.currentPeriodEnd)
      ) {
        const now = new Date();
        const end = new Date(now.getTime());
        end.setFullYear(end.getFullYear() + 1);
        await this.usersService.updateProfileComplete(
          req.user._id.toString(),
          req.user.isProfileComplete,
        );
        // Directly update subscription without changing other fields
        await (this as any).usersService['userModel'].findByIdAndUpdate(
          req.user._id,
          {
            subscription: {
              status: 'active',
              currentPeriodStart: now,
              currentPeriodEnd: end,
              cancelAtPeriodEnd: false,
            },
          },
        );
        // reflect in-memory object for response
        req.user.subscription = {
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: end,
          cancelAtPeriodEnd: false,
        } as any;
      }
    } catch (e) {
      // non-fatal
      console.warn(
        '[AuthController] lazy subscription init failed:',
        e?.message || e,
      );
    }

    // Compute subscription active state
    const sub = req.user.subscription;
    const now = new Date();
    const isSubscriptionActive = !!(
      req.user.isPaymentVerified &&
      sub &&
      sub.currentPeriodEnd &&
      new Date(sub.currentPeriodEnd) > now
    );

    return {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      isEmailVerified: req.user.isEmailVerified,
      isPaymentVerified: req.user.isPaymentVerified,
      isProfileComplete,
      subscription: req.user.subscription || { status: 'none' },
      isSubscriptionActive,
      billing: req.user.billing || null,
      stripeCustomerId: req.user.stripeCustomerId || null,
    };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'New access token generated',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const authResponse = await this.authService.refreshToken(
      refreshTokenDto.refresh_token,
    );

    // Update cookies with new tokens
    res.cookie('access_token', authResponse.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000, // 24h
    });

    res.cookie('refresh_token', authResponse.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return authResponse;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout user and clear refresh token' })
  @ApiResponse({ status: 200, description: 'Successfully logged out' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(@Request() req, @Res({ passthrough: true }) res: Response) {
    await this.usersService.clearRefreshToken(req.user._id);

    // Clear cookies
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.clearCookie('csrf-secret');
    res.clearCookie('csrf-token');

    return { message: 'Successfully logged out' };
  }

  @Get('verify-email')
  @ApiOperation({ summary: 'Verify email address' })
  @ApiQuery({ name: 'token', description: 'Email verification token' })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired token',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async verifyEmail(@Query('token') token: string) {
    try {
      const result = await this.authService.verifyEmail(token);
      return {
        success: result.success,
        message: result.message,
        user: result.user,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent if email exists',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.newPassword,
    );
  }

  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend email verification' })
  @ApiResponse({
    status: 200,
    description: 'Verification email sent if email exists and is unverified',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async resendVerification(
    @Body() resendVerificationDto: ResendVerificationDto,
  ) {
    return this.authService.resendVerificationEmail(
      resendVerificationDto.email,
    );
  }

  @Post('login-with-token')
  @ApiOperation({ summary: 'Login with verification token' })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged in',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  async loginWithToken(
    @Body() { token }: { token: string },
  ): Promise<AuthResponse> {
    return this.authService.loginWithToken(token);
  }

  @Get('csrf-token')
  @ApiOperation({ summary: 'Get CSRF token for authenticated requests' })
  @ApiResponse({ status: 200, description: 'CSRF token generated' })
  getCsrfToken(@Res({ passthrough: true }) res: Response) {
    const csrfSecret = this.csrfService.generateSecret();
    const csrfToken = this.csrfService.generateToken(csrfSecret);

    res.cookie('csrf-secret', csrfSecret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return { csrfToken };
  }
}
