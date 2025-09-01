import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Seller, SellerDocument } from './schemas/seller.schema';
import { CreateSellerProfileDto } from './dto/create-seller-profile.dto';
import { UpdateSellerProfileDto } from './dto/update-seller-profile.dto';

@Injectable()
export class SellersService {
  constructor(
    @InjectModel(Seller.name) private sellerModel: Model<SellerDocument>,
  ) {}

  // Creates seller profile linked to authenticated user
  async createProfile(userId: string, createProfileDto: CreateSellerProfileDto): Promise<Seller> {
    const existingProfile = await this.sellerModel.findOne({ userId });
    if (existingProfile) {
      throw new ConflictException('Seller profile already exists');
    }

    const seller = new this.sellerModel({
      userId,
      ...createProfileDto,
    });

    return seller.save();
  }

  // Retrieves seller profile by user ID
  async getProfileByUserId(userId: string): Promise<Seller | null> {
    return this.sellerModel.findOne({ userId }).populate('userId', 'name email');
  }

  // Updates seller profile fields
  async updateProfile(userId: string, updateProfileDto: UpdateSellerProfileDto): Promise<Seller> {
    const seller = await this.sellerModel.findOneAndUpdate(
      { userId },
      updateProfileDto,
      { new: true, runValidators: true }
    );

    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    return seller;
  }

  // Gets seller by ID (used by matching service)
  async getSellerByUserId(userId: string): Promise<Seller> {
    const seller = await this.sellerModel.findOne({ userId });
    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }
    return seller;
  }
}