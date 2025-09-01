import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Advisor } from './schemas/advisor.schema';
import { CreateAdvisorProfileDto } from './dto/create-advisor-profile.dto';
import { UpdateAdvisorProfileDto } from './dto/update-advisor-profile.dto';

@Injectable()
export class AdvisorsService {
  constructor(@InjectModel(Advisor.name) private advisorModel: Model<Advisor>) {
    this.initializeIndexes();
  }

  private async initializeIndexes() {
    try {
      // Drop all existing indexes except _id
      await this.advisorModel.collection.dropIndexes();
      
      // Recreate proper indexes
      await this.advisorModel.collection.createIndex({ userId: 1 }, { unique: true });
      await this.advisorModel.collection.createIndex({ industries: 1 });
      await this.advisorModel.collection.createIndex({ geographies: 1 });
      await this.advisorModel.collection.createIndex({ isActive: 1, sendLeads: 1 });
      
      console.log('Advisor indexes recreated successfully');
    } catch (error) {
      console.log('Index initialization error (may be normal):', error.message);
    }
  }

  async createProfile(userId: string, createAdvisorProfileDto: CreateAdvisorProfileDto): Promise<Advisor> {
    const existingProfile = await this.advisorModel.findOne({ userId });
    if (existingProfile) {
      throw new ConflictException('Advisor profile already exists');
    }

    const advisor = new this.advisorModel({
      userId,
      ...createAdvisorProfileDto,
    });

    return advisor.save();
  }

  async getProfileByUserId(userId: string): Promise<Advisor | null> {
    return this.advisorModel.findOne({ userId });
  }

  async updateProfile(userId: string, updateAdvisorProfileDto: UpdateAdvisorProfileDto): Promise<Advisor> {
    const advisor = await this.advisorModel.findOneAndUpdate(
      { userId },
      updateAdvisorProfileDto,
      { new: true }
    );

    if (!advisor) {
      throw new NotFoundException('Advisor profile not found');
    }

    return advisor;
  }

  async toggleLeadSending(userId: string, sendLeads: boolean): Promise<Advisor> {
    const advisor = await this.advisorModel.findOneAndUpdate(
      { userId },
      { sendLeads },
      { new: true }
    );

    if (!advisor) {
      throw new NotFoundException('Advisor profile not found');
    }

    return advisor;
  }

  async findActiveAdvisors(): Promise<Advisor[]> {
    return this.advisorModel.find({ isActive: true, sendLeads: true });
  }
}