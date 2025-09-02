import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Advisor } from '../advisors/schemas/advisor.schema';
import { Seller } from '../sellers/schemas/seller.schema';
import { AdvisorCardDto } from './dto/advisor-card.dto';

@Injectable()
export class MatchingService {
  constructor(
    @InjectModel(Advisor.name) private advisorModel: Model<Advisor>,
    @InjectModel(Seller.name) private sellerModel: Model<Seller>,
  ) {}

  async findMatches(sellerId: string, sortBy?: string): Promise<AdvisorCardDto[]> {
    const seller = await this.sellerModel.findOne({ userId: sellerId });
    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    let sortCriteria = {};
    if (sortBy === 'years') sortCriteria = { yearsExperience: -1 };
    else if (sortBy === 'company') sortCriteria = { companyName: 1 };
    else sortCriteria = { createdAt: -1 };

    const matches = await this.advisorModel.find({
      isActive: true,
      sendLeads: true,
      industries: { $in: [seller.industry] },
      geographies: { $in: [seller.geography] },
      $or: [
        { 'revenueRange.min': { $lte: seller.annualRevenue } },
        { 'revenueRange.min': { $exists: false } }
      ],
      $and: [{
        $or: [
          { 'revenueRange.max': { $gte: seller.annualRevenue } },
          { 'revenueRange.max': { $exists: false } }
        ]
      }]
    }).populate('userId', 'name email').sort(sortCriteria);

    return matches.map(advisor => ({
      id: advisor._id.toString(),
      companyName: advisor.companyName,
      industries: advisor.industries,
      geographies: advisor.geographies,
      yearsExperience: advisor.yearsExperience,
      numberOfTransactions: advisor.numberOfTransactions,
      licensing: advisor.licensing,
      revenueRange: advisor.revenueRange,
      advisorName: (advisor.userId as any).name,
      advisorEmail: (advisor.userId as any).email,
      phone: advisor.phone,
      website: advisor.website,
      currency: advisor.currency,
      description: advisor.description,
      logoUrl: advisor.logoUrl,
      testimonials: advisor.testimonials || [],
    }));
  }

  async getMatchStats(sellerId: string): Promise<{ totalMatches: number; industries: string[]; geographies: string[] }> {
    const matches = await this.findMatches(sellerId);
    const industries = [...new Set(matches.flatMap(m => m.industries))];
    const geographies = [...new Set(matches.flatMap(m => m.geographies))];
    
    return {
      totalMatches: matches.length,
      industries,
      geographies
    };
  }
}