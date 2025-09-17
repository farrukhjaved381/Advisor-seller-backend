import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { EmailService } from './email.service';
import { User, UserRole } from '../users/schemas/user.schema';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;

  const mockUser = {
    _id: 'user123',
    email: 'test@example.com',
    name: 'Test User',
    role: UserRole.ADVISOR,
    password: 'hashedPassword',
    isEmailVerified: true,
  };

  const mockUsersService = {
    create: jest.fn(),
    findByEmail: jest.fn(),
    findById: jest.fn(),
    updateRefreshToken: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockEmailService = {
    sendVerificationEmail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('register', () => {
    it('✅ should register user with valid data', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        role: UserRole.ADVISOR,
      };

      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue(mockUser);

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('user');
      expect(result.user.email).toBe(registerDto.email);
      expect(mockUsersService.create).toHaveBeenCalled();
    });

    it('❌ should throw error for duplicate email', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        role: UserRole.ADVISOR,
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    it('✅ should login with valid credentials', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('jwt-token');

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('❌ should throw error for wrong password', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
