import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Advisor } from './schemas/advisor.schema';
import { CreateAdvisorProfileDto } from './dto/create-advisor-profile.dto';
import { UpdateAdvisorProfileDto } from './dto/update-advisor-profile.dto';
import { UsersService } from '../users/users.service';
import { v2 as cloudinary } from 'cloudinary';
import { Connection, ConnectionDocument } from '../connections/schemas/connection.schema';

@Injectable()
export class AdvisorsService {
  constructor(
    @InjectModel(Advisor.name) private advisorModel: Model<Advisor>,
    @InjectModel(Connection.name) private connectionModel: Model<ConnectionDocument>,
    private usersService: UsersService,
  ) {
    this.initializeIndexes();

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  private async initializeIndexes() {
    try {
      await this.advisorModel.collection.dropIndexes();
      await this.advisorModel.collection.createIndex({ userId: 1 }, { unique: true });
      await this.advisorModel.collection.createIndex({ industries: 1 });
      await this.advisorModel.collection.createIndex({ geographies: 1 });
      await this.advisorModel.collection.createIndex({ isActive: 1, sendLeads: 1 });

      console.log('Advisor indexes recreated successfully');
    } catch (error) {
      console.log('Index initialization error (may be normal):', error.message);
    }
  }

  // ========== BASIC CRUD ==========

  async createProfile(
    userId: string,
    createDto: CreateAdvisorProfileDto,
  ): Promise<Advisor> {
    const existingProfile = await this.advisorModel.findOne({ userId });
    if (existingProfile) {
      throw new ConflictException('Advisor profile already exists');
    }

    const newProfile = new this.advisorModel({
      userId,
      ...createDto,
      isActive: true,
    });

    const savedProfile = await newProfile.save();

    await this.usersService.updateProfileComplete(userId, true);

    return savedProfile;
  }

  async getProfileByUserId(userId: string): Promise<Advisor | null> {
    return this.advisorModel.findOne({ userId });
  }

  async updateProfile(
    userId: string,
    updateAdvisorProfileDto: UpdateAdvisorProfileDto,
  ): Promise<Advisor> {
    const advisor = await this.advisorModel.findOneAndUpdate(
      { userId },
      updateAdvisorProfileDto,
      { new: true },
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
      { new: true },
    );

    if (!advisor) {
      throw new NotFoundException('Advisor profile not found');
    }

    return advisor;
  }

  async findActiveAdvisors(): Promise<Advisor[]> {
    return this.advisorModel.find({ isActive: true, sendLeads: true });
  }

  // ========== EXTENDED FILE UPLOAD SUPPORT ==========

  private async uploadToCloudinary(
    file: Express.Multer.File,
    type: 'logo' | 'testimonial',
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `advisor-seller/${type}s`,
          resource_type: type === 'logo' ? 'image' : 'raw',
          public_id: `${Date.now()}-${file.originalname.split('.')[0]}`,
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else if (result) {
            resolve(result.secure_url);
          } else {
            reject(new Error('Upload failed'));
          }
        },
      );
      uploadStream.end(file.buffer);
    });
  }

  async addTestimonial(
    userId: string,
    testimonialData: { clientName: string; testimonial: string; pdfUrl?: string },
  ): Promise<Advisor> {
    const advisor = await this.advisorModel.findOne({ userId });
    if (!advisor) {
      throw new NotFoundException('Advisor profile not found');
    }

    if (advisor.testimonials.length >= 5) {
      throw new ConflictException('Maximum 5 testimonials allowed');
    }

    advisor.testimonials.push(testimonialData);
    return advisor.save();
  }

  async updateLogo(userId: string, logoUrl: string): Promise<Advisor> {
    const advisor = await this.advisorModel.findOneAndUpdate(
      { userId },
      { logoUrl },
      { new: true },
    );

    if (!advisor) {
      throw new NotFoundException('Advisor profile not found');
    }

    return advisor;
  }

  // ========== PATCH FULL PROFILE (FIELDS + FILES) ==========

  async updateFullProfile(
    userId: string,
    updateProfileDto: any,
    files?: { logo?: Express.Multer.File[]; testimonials?: Express.Multer.File[] },
  ): Promise<Advisor> {
    const advisor = await this.advisorModel.findOne({ userId });
    if (!advisor) {
      throw new NotFoundException('Advisor profile not found');
    }

    // ✅ Step 1: Update normal fields
    if (updateProfileDto) {
      Object.keys(updateProfileDto).forEach((key) => {
        advisor[key] = updateProfileDto[key];
      });
    }

    // ✅ Step 2: Handle Logo Upload (if provided)
    if (files?.logo && files.logo.length > 0) {
      const logoFile = files.logo[0];
      const logoUrl = await this.uploadToCloudinary(logoFile, 'logo');
      advisor.logoUrl = logoUrl;
    }

    // ✅ Step 3: Handle Testimonials Upload (if provided)
    if (files?.testimonials && files.testimonials.length > 0) {
      if (advisor.testimonials.length + files.testimonials.length > 5) {
        throw new BadRequestException('Maximum 5 testimonials allowed');
      }

      for (const testimonialFile of files.testimonials) {
        if (testimonialFile.mimetype !== 'application/pdf') {
          throw new BadRequestException('Only PDF testimonials allowed');
        }
        const pdfUrl = await this.uploadToCloudinary(testimonialFile, 'testimonial');
        advisor.testimonials.push({
          clientName: updateProfileDto?.clientName || 'Unknown',
          testimonial: updateProfileDto?.testimonial || 'No testimonial text provided',
          pdfUrl,
        });
      }
    }

    return advisor.save();
  }

  async getLeadsForAdvisor(advisorId: string): Promise<ConnectionDocument[]> {
    const advisorProfile = await this.advisorModel.findOne({ userId: advisorId });
    if (!advisorProfile) {
      throw new NotFoundException('Advisor profile not found');
    }

    return this.connectionModel
      .find({ advisorId: advisorProfile._id })
      .populate({
        path: 'sellerId',
        select: 'companyName industry geography annualRevenue description',
      })
      .exec();
  }
}
