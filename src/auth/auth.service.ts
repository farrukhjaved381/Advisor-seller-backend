import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { EmailService } from './email.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginUserDto } from '../users/dto/login-user.dto';
import { User } from '../users/schemas/user.schema';

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
  };
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  async register(createUserDto: CreateUserDto): Promise<AuthResponse> {
    const user = await this.usersService.create(createUserDto);
    
    // Generate verification token and send email
    const verificationToken = this.jwtService.sign(
      { sub: (user as any)._id.toString(), type: 'email_verification' },
      { expiresIn: '24h' }
    );
    
    try {
      await this.emailService.sendVerificationEmail(
        user.email,
        user.name,
        verificationToken
      );
      console.log(`Verification email sent to ${user.email}`);
    } catch (error) {
      console.error('Failed to send verification email:', error);
      // Don't throw error - allow registration to complete
    }
    
    return this.generateAuthResponse(user);
  }

  async login(loginUserDto: LoginUserDto): Promise<AuthResponse> {
    const user = await this.validateUser(loginUserDto.email, loginUserDto.password);
    
    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    return this.generateAuthResponse(user);
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    const user = await this.usersService.findByRefreshToken(refreshToken);
    if (!user || !user.refreshTokenExpiry || user.refreshTokenExpiry < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return this.generateAuthResponse(user);
  }

  async verifyEmail(token: string): Promise<{ message: string; success: boolean }> {
    try {
      const payload = this.jwtService.verify(token);
      
      if (payload.type !== 'email_verification') {
        throw new BadRequestException('Invalid verification token');
      }
      
      await this.usersService.verifyEmail(payload.sub);
      
      return { message: 'Email verified successfully! You can now login.', success: true };
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
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await this.usersService.validatePassword(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  private async generateAuthResponse(user: User): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: (user as any)._id.toString(),
      email: user.email,
      role: user.role,
    };

    // Generate access token (1 hour)
    const accessToken = this.jwtService.sign(payload, { expiresIn: '24h' });
    
    // Generate refresh token (7 days)
    const refreshToken = this.jwtService.sign(
      { sub: (user as any)._id.toString(), type: 'refresh' },
      { expiresIn: '7d' }
    );

    // Save refresh token to database
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7);
    
    await this.usersService.updateRefreshToken(
      (user as any)._id.toString(),
      refreshToken,
      refreshTokenExpiry
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: (user as any)._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }
}