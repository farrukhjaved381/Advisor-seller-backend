import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Seller } from './schemas/seller.schema';
import { CreateSellerProfileDto } from './dto/create-seller-profile.dto';
import { UpdateSellerProfileDto } from './dto/update-seller-profile.dto';

@Injectable()
export class SellersService {
  constructor(@InjectModel(Seller.name) private sellerModel: Model<Seller>) {}

  async createProfile(userId: string, createSellerProfileDto: CreateSellerProfileDto): Promise<Seller> {
    const existingProfile = await this.sellerModel.findOne({ userId });
    if (existingProfile) {
      throw new ConflictException('Seller profile already exists');
    }

    const seller = new this.sellerModel({
      userId,
      ...createSellerProfileDto,
    });

    return seller.save();
  }

  async getProfileByUserId(userId: string): Promise<Seller | null> {
    return this.sellerModel.findOne({ userId });
  }

  async updateProfile(userId: string, updateSellerProfileDto: UpdateSellerProfileDto): Promise<Seller> {
    const seller = await this.sellerModel.findOneAndUpdate(
      { userId },
      updateSellerProfileDto,
      { new: true }
    );

    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    return seller;
  }

  async deleteProfile(userId: string): Promise<{ message: string }> {
    const result = await this.sellerModel.deleteOne({ userId });
    
    if (result.deletedCount === 0) {
      throw new NotFoundException('Seller profile not found');
    }

    return { message: 'Seller profile deleted successfully' };
  }

  async toggleActiveStatus(userId: string, isActive: boolean): Promise<Seller> {
    const seller = await this.sellerModel.findOneAndUpdate(
      { userId },
      { isActive },
      { new: true }
    );

    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    return seller;
  }

  async findAll(): Promise<Seller[]> {
    return this.sellerModel.find().populate('userId', 'name email');
  }

  async findById(id: string): Promise<Seller | null> {
    return this.sellerModel.findById(id).populate('userId', 'name email');
  }
}