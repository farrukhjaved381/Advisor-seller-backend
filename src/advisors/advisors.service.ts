import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Advisor, AdvisorDocument } from './schemas/advisor.schema';
import { CreateAdvisorProfileDto } from './dto/create-advisor-profile.dto';
import { UpdateAdvisorProfileDto } from './dto/update-advisor-profile.dto';

@Injectable()
export class AdvisorsService {
  constructor(
    @InjectModel(Advisor.name) private advisorModel: Model<AdvisorDocument>,
  ) {}

  // Creates advisor profile linked to authenticated user
  async createProfile(userId: string, createProfileDto: CreateAdvisorProfileDto): Promise<Advisor> {
    const existingProfile = await this.advisorModel.findOne({ userId });
    if (existingProfile) {
      throw new ConflictException('Advisor profile already exists');
    }

    const advisor = new this.advisorModel({
      userId,
      ...createProfileDto,
    });

    return advisor.save();
  }

  // Retrieves advisor profile by user ID
  async getProfileByUserId(userId: string): Promise<Advisor | null> {
    return this.advisorModel.findOne({ userId }).populate('userId', 'name email');
  }

  // Updates advisor profile fields
  async updateProfile(userId: string, updateProfileDto: UpdateAdvisorProfileDto): Promise<Advisor> {
    const advisor = await this.advisorModel.findOneAndUpdate(
      { userId },
      updateProfileDto,
      { new: true, runValidators: true }
    );

    if (!advisor) {
      throw new NotFoundException('Advisor profile not found');
    }

    return advisor;
  }

  // Toggles lead sending status
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

  // Activates advisor profile (after payment/verification)
  async activateProfile(userId: string): Promise<Advisor> {
    const advisor = await this.advisorModel.findOneAndUpdate(
      { userId },
      { isActive: true },
      { new: true }
    );

    if (!advisor) {
      throw new NotFoundException('Advisor profile not found');
    }

    return advisor;
  }

  // Gets all active advisors for matching (used later)
  async getActiveAdvisors(): Promise<Advisor[]> {
    return this.advisorModel.find({ isActive: true, sendLeads: true });
  }
}