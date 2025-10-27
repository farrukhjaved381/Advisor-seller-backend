import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Advisor } from './schemas/advisor.schema';
import { Seller, SellerDocument } from '../sellers/schemas/seller.schema';
import { CreateAdvisorProfileDto } from './dto/create-advisor-profile.dto';
import { UpdateAdvisorProfileDto } from './dto/update-advisor-profile.dto';
import { UsersService } from '../users/users.service';
import { v2 as cloudinary } from 'cloudinary';
import {
  Connection,
  ConnectionDocument,
  ConnectionType,
} from '../connections/schemas/connection.schema';

@Injectable()
export class AdvisorsService {
  constructor(
    @InjectModel(Advisor.name) private advisorModel: Model<Advisor>,
    @InjectModel(Connection.name)
    private connectionModel: Model<ConnectionDocument>,
    @InjectModel(Seller.name)
    private sellerModel: Model<SellerDocument>,
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
      await this.advisorModel.collection.createIndex(
        { userId: 1 },
        { unique: true },
      );
      await this.advisorModel.collection.createIndex({ industries: 1 });
      await this.advisorModel.collection.createIndex({ geographies: 1 });
      await this.advisorModel.collection.createIndex({
        isActive: 1,
        sendLeads: 1,
      });

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
    if (
      !Array.isArray(createDto.testimonials) ||
      createDto.testimonials.length !== 5 ||
      createDto.testimonials.some(
        (testimonial) =>
          !testimonial?.clientName?.trim() || !testimonial?.testimonial?.trim(),
      )
    ) {
      throw new BadRequestException(
        'Exactly 5 testimonials with client name and testimonial text are required',
      );
    }

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

  async toggleLeadSending(
    userId: string,
    sendLeads: boolean,
  ): Promise<Advisor> {
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
    type: 'logo' | 'testimonial' | 'video',
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `advisor-seller/${type}s`,
          resource_type:
            type === 'logo' ? 'image' : type === 'video' ? 'video' : 'raw',
          public_id: `${Date.now()}-${file.originalname.split('.')[0]}`,
        },
        (error, result) => {
          if (error) {
            const reason: Error =
              error instanceof Error
                ? error
                : new Error(
                    typeof error === 'string'
                      ? error
                      : (error as { message?: unknown })?.message &&
                          typeof (error as { message?: unknown }).message ===
                            'string'
                        ? String((error as { message?: unknown }).message)
                        : 'Cloudinary upload failed',
                  );
            reject(reason);
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
    testimonialData: {
      clientName: string;
      testimonial: string;
      pdfUrl?: string;
    },
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
    files?: {
      logo?: Express.Multer.File[];
      testimonials?: Express.Multer.File[];
      introVideo?: Express.Multer.File[];
    },
  ): Promise<Advisor> {
    const advisor = await this.advisorModel.findOne({ userId });
    if (!advisor) {
      throw new NotFoundException('Advisor profile not found');
    }

    // ✅ Step 1: Update normal fields with coercion for arrays/objects
    if (updateProfileDto) {
      const coerce = (val: any) => {
        if (typeof val === 'string') {
          const s = val.trim();
          if (
            (s.startsWith('[') && s.endsWith(']')) ||
            (s.startsWith('{') && s.endsWith('}'))
          ) {
            try {
              return JSON.parse(s);
            } catch {}
          }
        }
        return val;
      };
      const keys = Object.keys(updateProfileDto);
      for (const key of keys) {
        let value: any = updateProfileDto[key];
        value = coerce(value);
        if (key === 'testimonials') {
          let testimonialsValue = value;
          if (typeof testimonialsValue === 'string') {
            try {
              testimonialsValue = JSON.parse(testimonialsValue);
            } catch {
              testimonialsValue = [];
            }
          }
          if (!Array.isArray(testimonialsValue)) {
            throw new BadRequestException('Testimonials must be an array');
          }
          const normalized = testimonialsValue
            .slice(0, 5)
            .map((testimonial) => {
              const clientName =
                typeof testimonial?.clientName === 'string'
                  ? testimonial.clientName.trim()
                  : '';
              const testimonialText =
                typeof testimonial?.testimonial === 'string'
                  ? testimonial.testimonial.trim()
                  : '';
              const pdfUrl =
                typeof testimonial?.pdfUrl === 'string' &&
                testimonial.pdfUrl.trim().length > 0
                  ? testimonial.pdfUrl.trim()
                  : undefined;
              return {
                clientName,
                testimonial: testimonialText,
                ...(pdfUrl ? { pdfUrl } : {}),
              };
            });

          if (
            normalized.length !== 5 ||
            normalized.some(
              (testimonial) =>
                !testimonial.clientName || !testimonial.testimonial,
            )
          ) {
            throw new BadRequestException(
              'Exactly 5 testimonials with client name and testimonial text are required',
            );
          }

          advisor.testimonials = normalized;
          continue;
        }
        if (key === 'industries' || key === 'geographies') {
          if (Array.isArray(value)) {
            if (
              value.length === 1 &&
              typeof value[0] === 'string' &&
              value[0].includes(',')
            ) {
              value = value[0]
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean);
            }
          } else if (typeof value === 'string') {
            value = value
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean);
          } else {
            value = [];
          }
        }
        advisor[key] = value;
      }
      // Handle bracketed range fields if they came as separate keys
      const minKey = 'revenueRange[min]';
      const maxKey = 'revenueRange[max]';
      if (minKey in updateProfileDto || maxKey in updateProfileDto) {
        if (!advisor.revenueRange) {
          // Initialize to avoid TS undefined complaints and ensure persistence
          (advisor as any).revenueRange = {};
        }
        const rr: any = advisor.revenueRange as any;
        if (minKey in updateProfileDto)
          rr.min = Number(updateProfileDto[minKey]);
        if (maxKey in updateProfileDto)
          rr.max = Number(updateProfileDto[maxKey]);
      }
    }

    // ✅ Step 2: Handle Logo Upload (if provided)
    if (files?.logo && files.logo.length > 0) {
      const logoFile = files.logo[0];
      const logoUrl = await this.uploadToCloudinary(logoFile, 'logo');
      advisor.logoUrl = logoUrl;
    }

    // ✅ Step 2b: Handle Intro Video Upload (if provided)
    if (files?.introVideo && files.introVideo.length > 0) {
      const videoFile = files.introVideo[0];
      if (!videoFile.mimetype.startsWith('video/')) {
        throw new BadRequestException(
          'Only video files are allowed for introVideo',
        );
      }
      const videoUrl = await this.uploadToCloudinary(videoFile, 'video');
      advisor.introVideoUrl = videoUrl;
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
        const pdfUrl = await this.uploadToCloudinary(
          testimonialFile,
          'testimonial',
        );
        advisor.testimonials.push({
          clientName: updateProfileDto?.clientName || 'Unknown',
          testimonial:
            updateProfileDto?.testimonial || 'No testimonial text provided',
          pdfUrl,
        });
      }
    }

    if (
      !Array.isArray(advisor.testimonials) ||
      advisor.testimonials.length !== 5 ||
      advisor.testimonials.some(
        (testimonial) =>
          !testimonial?.clientName?.trim() || !testimonial?.testimonial?.trim(),
      )
    ) {
      throw new BadRequestException(
        'Advisor profile must include exactly 5 testimonials with client name and testimonial text',
      );
    }

    return advisor.save();
  }

  async getLeadsForAdvisor(advisorId: string): Promise<{
    stats: {
      totalLeads: number;
      leadsThisMonth: number;
      leadsLastMonth: number;
      leadsThisWeek: number;
      leadsByType: Record<string, number>;
      monthlyTrend: { month: string; count: number }[];
    };
    leads: any[];
  }> {
    console.log('[AdvisorsService] getLeadsForAdvisor start', {
      advisorUserId: advisorId,
      at: new Date().toISOString(),
    });
    
    // Debug: Check if advisor profile exists
    const advisorProfile = await this.advisorModel
      .findOne({ userId: advisorId })
      .select('_id');
    console.log('[AdvisorsService] Advisor profile lookup result:', {
      advisorUserId: advisorId,
      profileFound: !!advisorProfile,
      profileId: advisorProfile?._id?.toString(),
    });
    
    if (!advisorProfile) {
      console.warn(
        '[AdvisorsService] No advisor profile found for user',
        advisorId,
      );
      // Return empty stats instead of throwing error
      return {
        stats: {
          totalLeads: 0,
          leadsThisMonth: 0,
          leadsLastMonth: 0,
          leadsThisWeek: 0,
          leadsByType: {},
          monthlyTrend: [],
        },
        leads: [],
      };
    }
    
    // Debug: Check total connections in database
    const totalConnections = await this.connectionModel.countDocuments();
    console.log('[AdvisorsService] Total connections in database:', totalConnections);

    // Debug: Check what connections exist for this advisor profile ID
    const debugQuery = { advisorId: advisorProfile._id };
    console.log('[AdvisorsService] Querying connections with:', {
      query: debugQuery,
      advisorProfileId: advisorProfile._id.toString(),
      advisorProfileIdType: typeof advisorProfile._id,
    });
    
    // Also check if there are any connections with string version of the ID
    const stringQuery = { advisorId: advisorProfile._id.toString() };
    const stringMatches = await this.connectionModel.find(stringQuery).lean();
    console.log('[AdvisorsService] String ID matches:', {
      stringQuery,
      count: stringMatches.length,
    });

    // Pull raw leads (sellerId references User, not Seller)
    const allLeads = await this.connectionModel
      .find({ advisorId: advisorProfile._id })
      .sort({ createdAt: -1 })
      .lean() // lean for faster mapping
      .exec();
    console.log('[AdvisorsService] Found leads', {
      count: allLeads.length,
      advisorProfileId: advisorProfile._id.toString(),
      leads: allLeads.map(l => ({
        id: l._id.toString(),
        type: l.type,
        sellerId: l.sellerId.toString(),
        advisorId: l.advisorId.toString(),
        createdAt: l.createdAt,
      })),
    });

    const leads = allLeads || [];

    // Map seller userIds to seller profiles
    const sellerUserIds = Array.from(
      new Set(
        (leads || [])
          .map((l) => (l.sellerId ? String(l.sellerId) : null))
          .filter((v): v is string => Boolean(v)),
      ),
    );
    console.log(
      '[AdvisorsService] Unique seller userIds from leads',
      sellerUserIds,
    );

    const sellers = await this.sellerModel
      .find({ userId: { $in: sellerUserIds } })
      .select(
        'userId companyName industry geography annualRevenue description phone website currency contactEmail contactName',
      )
      .lean();
    const sellerMap = new Map<string, any>();
    sellers.forEach((s) => sellerMap.set(String(s.userId), s));
    const missing = sellerUserIds.filter((id) => !sellerMap.has(id));
    if (missing.length > 0) {
      console.warn(
        '[AdvisorsService] Missing seller profiles for userIds',
        missing,
      );
    }

    const leadsWithSeller = leads.map((l) => {
      const sellerUserId = l.sellerId ? String(l.sellerId) : null;
      const sellerProfile = sellerUserId
        ? sellerMap.get(sellerUserId) || null
        : null;

      const isDirectListLead =
        (l.type || ConnectionType.INTRODUCTION) === ConnectionType.DIRECT_LIST;

      const snapshotSource = l as any;
      const snapshot: Record<string, any> = {};
      if (snapshotSource.sellerIndustry)
        snapshot.industry = snapshotSource.sellerIndustry;
      if (snapshotSource.sellerGeography)
        snapshot.geography = snapshotSource.sellerGeography;
      if (snapshotSource.sellerAnnualRevenue !== undefined)
        snapshot.annualRevenue = snapshotSource.sellerAnnualRevenue;
      if (snapshotSource.sellerCurrency)
        snapshot.currency = snapshotSource.sellerCurrency;

      if (!isDirectListLead) {
        if (snapshotSource.sellerCompanyName)
          snapshot.companyName = snapshotSource.sellerCompanyName;
        if (snapshotSource.sellerContactEmail)
          snapshot.contactEmail = snapshotSource.sellerContactEmail;
        if (snapshotSource.sellerContactName)
          snapshot.contactName = snapshotSource.sellerContactName;
        if (snapshotSource.sellerPhone)
          snapshot.phone = snapshotSource.sellerPhone;
        if (snapshotSource.sellerWebsite)
          snapshot.website = snapshotSource.sellerWebsite;
      }

      let mergedSeller: Record<string, any> | null = null;
      if (!isDirectListLead) {
        mergedSeller = sellerProfile
          ? {
              ...sellerProfile,
              ...(Object.keys(snapshot).length > 0 ? snapshot : {}),
            }
          : Object.keys(snapshot).length > 0
            ? snapshot
            : null;
      } else {
        const anonymizedName = 'Seller will reach out directly';
        mergedSeller = {
          industry:
            snapshot.industry ?? sellerProfile?.industry ?? 'Not specified',
          geography:
            snapshot.geography ?? sellerProfile?.geography ?? 'Not specified',
          annualRevenue:
            snapshot.annualRevenue ?? sellerProfile?.annualRevenue ?? null,
          currency: snapshot.currency ?? sellerProfile?.currency ?? 'USD',
          description: null,
          companyName: anonymizedName,
          contactName: null,
          contactEmail: null,
          phone: null,
          website: null,
          isAnonymous: true,
        };
      }

      const result = {
        ...l,
        sellerId: l.sellerId,
        seller: mergedSeller,
        sellerUserId,
        contactHidden: isDirectListLead,
      };
      
      // Remove sensitive snapshot data for direct list leads
      if (isDirectListLead) {
        delete result.sellerCompanyName;
        delete result.sellerContactEmail;
        delete result.sellerContactName;
        delete result.sellerPhone;
        delete result.sellerWebsite;
      }
      
      return result;
    });
    console.log('[AdvisorsService] Mapped leads with seller', {
      source: leads.length,
      mapped: leadsWithSeller.length,
      resolved: leadsWithSeller.filter((x) => !!x.seller).length,
      unresolved: leadsWithSeller.filter((x) => !x.seller).length,
    });

    const dedupedLeads = leadsWithSeller;
    console.log('[AdvisorsService] Deduplicated leads', {
      before: leadsWithSeller.length,
      after: dedupedLeads.length,
    });

    const leadsForStats = dedupedLeads;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());

    const leadsThisMonth = leadsForStats.filter(
      (lead) => lead.createdAt >= startOfMonth,
    ).length;
    const leadsLastMonth = leadsForStats.filter(
      (lead) =>
        lead.createdAt >= startOfLastMonth && lead.createdAt < startOfMonth,
    ).length;
    const leadsThisWeek = leadsForStats.filter(
      (lead) => lead.createdAt >= startOfWeek,
    ).length;

    const leadsByType = leadsForStats.reduce<Record<string, number>>(
      (acc, lead) => {
        const type = lead.type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {},
    );

    const monthlyTrendMap = new Map<string, number>();
    leadsForStats.forEach((lead) => {
      const createdAt =
        lead.createdAt instanceof Date
          ? lead.createdAt
          : new Date(lead.createdAt);
      const key = `${createdAt.getFullYear()}-${createdAt.getMonth() + 1}`;
      monthlyTrendMap.set(key, (monthlyTrendMap.get(key) || 0) + 1);
    });

    const monthlyTrend = Array.from(monthlyTrendMap.entries())
      .map(([key, count]) => {
        const [year, month] = key.split('-').map(Number);
        return {
          label: new Date(year, month - 1).toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
          }),
          year,
          month,
          count,
        };
      })
      .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year))
      .slice(-6)
      .map(({ label, count }) => ({ month: label, count }));

    const result = {
      stats: {
        totalLeads: leadsForStats.length,
        leadsThisMonth,
        leadsLastMonth,
        leadsThisWeek,
        leadsByType,
        monthlyTrend,
      },
      leads: leadsForStats,
    };
    console.log('[AdvisorsService] getLeadsForAdvisor completed', {
      advisorUserId: advisorId,
      totalLeads: result.stats.totalLeads,
    });
    return result;
  }
}
