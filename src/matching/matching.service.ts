import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Advisor, AdvisorDocument } from '../advisors/schemas/advisor.schema';
import { Seller, SellerDocument } from '../sellers/schemas/seller.schema';
import { AdvisorCardDto } from './dto/advisor-card.dto';

@Injectable()
export class MatchingService {
  constructor(
    @InjectModel(Advisor.name) private advisorModel: Model<AdvisorDocument>,
    @InjectModel(Seller.name) private sellerModel: Model<SellerDocument>,
  ) {}

  // Finds matching advisors for a seller based on industry, geography, revenue, and active status
  async findMatches(userId: string, sortBy?: string): Promise<AdvisorCardDto[]> {
    // Fetch seller profile
    const seller = await this.sellerModel.findOne({ userId });
    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    // Build sort criteria
    const sortCriteria: any = {};
    if (sortBy === 'years') {
      sortCriteria.yearsExperience = -1; // Descending order
    } else if (sortBy === 'company') {
      sortCriteria.companyName = 1; // Ascending order
    } else {
      sortCriteria.createdAt = -1; // Default: newest first
    }

    // Matching query - filters based on industry alignment, geographic compatibility, revenue fit, and active status
    const matches = await this.advisorModel.find({
      industries: { $in: [seller.industry] }, // Seller industry must be in Advisor's industries array
      geographies: { $in: [seller.geography] }, // Seller geography must be in Advisor's geographies array
      'revenueRange.min': { $lte: seller.annualRevenue }, // Seller revenue >= Advisor's minimum
      'revenueRange.max': { $gte: seller.annualRevenue }, // Seller revenue <= Advisor's maximum
      isActive: true, // Only active advisors
      sendLeads: true, // Only advisors accepting leads
    })
    .select('companyName industries geographies yearsExperience logoUrl licensing revenueRange testimonials')
    .sort(sortCriteria)
    .exec();

    // Transform to AdvisorCardDto format
    return matches.map(advisor => ({
      id: (advisor as any)._id.toString(),
      companyName: advisor.companyName,
      industries: advisor.industries,
      geographies: advisor.geographies,
      yearsExperience: advisor.yearsExperience,
      logoUrl: advisor.logoUrl,
      licensing: advisor.licensing,
      revenueRange: advisor.revenueRange,
      testimonials: advisor.testimonials?.map(t => ({
        clientName: t.clientName,
        testimonial: t.testimonial,
        pdfUrl: t.pdfUrl,
      })),
    }));
  }

  // Gets match statistics for analytics
  async getMatchStats(userId: string): Promise<{ totalMatches: number; industries: string[]; geographies: string[] }> {
    const seller = await this.sellerModel.findOne({ userId });
    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    const totalMatches = await this.advisorModel.countDocuments({
      industries: { $in: [seller.industry] },
      geographies: { $in: [seller.geography] },
      'revenueRange.min': { $lte: seller.annualRevenue },
      'revenueRange.max': { $gte: seller.annualRevenue },
      isActive: true,
      sendLeads: true,
    });

    // Get unique industries and geographies from matches
    const matchedAdvisors = await this.advisorModel.find({
      industries: { $in: [seller.industry] },
      geographies: { $in: [seller.geography] },
      'revenueRange.min': { $lte: seller.annualRevenue },
      'revenueRange.max': { $gte: seller.annualRevenue },
      isActive: true,
      sendLeads: true,
    }).select('industries geographies');

    const industries = [...new Set(matchedAdvisors.flatMap(a => a.industries))];
    const geographies = [...new Set(matchedAdvisors.flatMap(a => a.geographies))];

    return { totalMatches, industries, geographies };
  }
}