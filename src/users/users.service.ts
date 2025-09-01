import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingUser = await this.userModel.findOne({ email: createUserDto.email });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(createUserDto.password, saltRounds);

    const user = new this.userModel({
      ...createUserDto,
      password: hashedPassword,
    });

    return user.save();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email: email.toLowerCase() });
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id);
  }

  async verifyEmail(userId: string): Promise<User> {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { 
        isEmailVerified: true,
        $unset: { emailVerificationToken: 1, emailVerificationExpires: 1 }
      },
      { new: true }
    );

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async validatePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  async updateRefreshToken(userId: string, refreshToken: string, expiry: Date): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      refreshToken,
      refreshTokenExpiry: expiry,
    });
  }

  async findByRefreshToken(refreshToken: string): Promise<User | null> {
    return this.userModel.findOne({ refreshToken });
  }

  async clearRefreshToken(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $unset: { refreshToken: 1, refreshTokenExpiry: 1 }
    });
  }
}