import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Advisor } from '../advisors/schemas/advisor.schema';
import { Seller } from '../sellers/schemas/seller.schema';
import { AdvisorCardDto } from './dto/advisor-card.dto';

const escapeRegex = (value: string) =>
  value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

@Injectable()
export class MatchingService {
  constructor(
    @InjectModel(Advisor.name) private advisorModel: Model<Advisor>,
    @InjectModel(Seller.name) private sellerModel: Model<Seller>,
  ) { }

  async findMatches(
    sellerId: string,
    sortBy?: string,
    page?: number,
    limit?: number,
  ): Promise<AdvisorCardDto[]> {
    const seller = await this.sellerModel.findOne({ userId: sellerId });
    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    const industryRegex = seller.industry
      ? new RegExp(`^${escapeRegex(seller.industry)}$`, 'i')
      : /.*/i;
    const geographyVariants = seller.geography
      ? [seller.geography, seller.geography.split('>')[0]?.trim()].filter(
        Boolean,
      )
      : [];
    const geographyRegexes = geographyVariants.map(
      (variant) => new RegExp(`^${escapeRegex(variant)}$`, 'i'),
    );
    const geographyConditions = geographyRegexes.map((regex) => ({
      geographies: { $regex: regex },
    }));

    // Priority sorting: CIM Amplify users first, then by specified criteria
    let sortCriteria = {};
    if (sortBy === 'years') {
      sortCriteria = { workedWithCimamplify: -1, yearsExperience: -1 };
    } else if (sortBy === 'company') {
      sortCriteria = { workedWithCimamplify: -1, companyName: 1 };
    } else {
      sortCriteria = { workedWithCimamplify: -1, createdAt: -1 };
    }

    let query = this.advisorModel
      .find({
        // Advisor must be active and accepting leads
        isActive: true,
        sendLeads: true,
        industries: { $regex: industryRegex },
        $and: [
          geographyConditions.length ? { $or: geographyConditions } : {},
          {
            $or: [
              { 'revenueRange.min': { $lte: seller.annualRevenue } },
              { 'revenueRange.min': { $exists: false } },
              { 'revenueRange.min': null },
            ],
          },
          {
            $or: [
              { 'revenueRange.max': { $gte: seller.annualRevenue } },
              { 'revenueRange.max': { $exists: false } },
              { 'revenueRange.max': null },
            ],
          },
        ].filter((condition) => Object.keys(condition).length > 0),
      })
      .populate('userId', 'name email')
      .sort(sortCriteria);

    // Apply pagination only if valid limit is provided to avoid breaking stats consumers
    if (limit && limit > 0) {
      const currentPage = page && page > 0 ? page : 1;
      const skip = (currentPage - 1) * limit;
      query = query.skip(skip).limit(limit);
    }

    const matches = await query;

    return matches.map((advisor) => {
      const advisorUser = advisor.userId as any;
      const advisorName =
        typeof advisorUser?.name === 'string' &&
          advisorUser.name.trim().length > 0
          ? advisorUser.name.trim()
          : advisor.companyName || 'Advisor';
      const advisorEmail =
        typeof advisorUser?.email === 'string' &&
          advisorUser.email.trim().length > 0
          ? advisorUser.email.trim()
          : 'Not provided';

      return {
        id: advisor._id.toString(),
        companyName: advisor.companyName,
        industries: advisor.industries,
        geographies: advisor.geographies,
        matchedIndustries: advisor.industries.filter((industry) =>
          industryRegex.test(industry),
        ),
        matchedGeographies: geographyRegexes.length
          ? advisor.geographies.filter((geo) =>
            geographyRegexes.some((regex) => regex.test(geo)),
          )
          : advisor.geographies,
        yearsExperience: advisor.yearsExperience,
        numberOfTransactions: advisor.numberOfTransactions,
        revenueRange: advisor.revenueRange,
        advisorName,
        advisorEmail,
        phone: advisor.phone,
        website: advisor.website,
        currency: advisor.currency,
        description: advisor.description,
        logoUrl: advisor.logoUrl,
        introVideoUrl: advisor.introVideoUrl,
        testimonials: advisor.testimonials || [],
        workedWithCimamplify: advisor.workedWithCimamplify,
        impressions: advisor.impressions || 0,
      } as AdvisorCardDto;
    });
  }

  async getMatchStats(sellerId: string): Promise<{
    totalMatches: number;
    industries: string[];
    geographies: string[];
  }> {
    const matches = await this.findMatches(sellerId);
    const industries = [...new Set(matches.flatMap((m) => m.industries))];
    const geographies = [...new Set(matches.flatMap((m) => m.geographies))];

    return {
      totalMatches: matches.length,
      industries,
      geographies,
    };
  }
}
