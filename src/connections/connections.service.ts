import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Advisor, AdvisorDocument } from '../advisors/schemas/advisor.schema';
import { Seller, SellerDocument } from '../sellers/schemas/seller.schema';
import { User } from '../users/schemas/user.schema';
import { MatchingService } from '../matching/matching.service';
import { EmailService } from '../auth/email.service';
import { IntroductionDto } from './dto/introduction.dto';
import * as fs from 'fs';
import * as path from 'path';
import {
  Connection,
  ConnectionDocument,
  ConnectionType,
} from './schemas/connection.schema';

@Injectable()
export class ConnectionsService {
  constructor(
    @InjectModel(Advisor.name) private advisorModel: Model<AdvisorDocument>,
    @InjectModel(Seller.name) private sellerModel: Model<SellerDocument>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Connection.name)
    private connectionModel: Model<ConnectionDocument>,
    private matchingService: MatchingService,
    private emailService: EmailService,
  ) {}

  private escapeHtml(value: string | number | null | undefined): string {
    const stringValue =
      value === null || value === undefined ? '' : String(value);
    return stringValue
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeAttr(value: string | number | null | undefined): string {
    return this.escapeHtml(value);
  }

  private formatCurrency(
    value: number | undefined,
    currencyCode?: string,
  ): string | null {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return null;
    }
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode || 'USD',
        maximumFractionDigits: 0,
      }).format(value);
    } catch (error) {
      return value.toLocaleString();
    }
  }

  private sanitizeSnapshotString(value?: string | null): string | undefined {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private formatListPreview(
    values: (string | null | undefined)[] | undefined,
    maxVisible = 3,
  ): {
    previewHtml: string;
    titleAttr: string;
    moreCount: number;
  } {
    const normalized =
      values
        ?.map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)) ?? [];

    if (normalized.length === 0) {
      const fallback = 'Not specified';
      return {
        previewHtml: this.escapeHtml(fallback),
        titleAttr: this.escapeAttr(fallback),
        moreCount: 0,
      };
    }

    const previewItems = normalized.slice(0, maxVisible);
    const previewText = previewItems.join(', ');
    const basePreviewHtml = this.escapeHtml(previewText);
    const moreCount = Math.max(normalized.length - previewItems.length, 0);
    const fullListAttr = this.escapeAttr(normalized.join(', '));

    if (moreCount === 0) {
      return {
        previewHtml: basePreviewHtml,
        titleAttr: fullListAttr,
        moreCount,
      };
    }

    const extraBadge = ` <span style="color:#4f46e5; font-weight:600;">+${moreCount} more</span>`;
    return {
      previewHtml: `${basePreviewHtml}${extraBadge}`,
      titleAttr: fullListAttr,
      moreCount,
    };
  }

  private applyTemplate(
    template: string,
    replacements: Record<string, string>,
  ): string {
    let result = template;
    for (const [key, rawValue] of Object.entries(replacements)) {
      const value = String(rawValue ?? '');
      const pattern = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(pattern, value);
    }
    return result;
  }

  private buildIntroductionContext(
    contextType: 'advisor-introduction' | 'seller-copy' | 'direct-list',
    data: {
      advisorDisplayNameText: string;
      advisorCompanyNameText: string;
      sellerCompanyText: string;
      sellerIndustryText: string;
      sellerGeographyText: string;
      sellerNameText: string;
      sellerEmailText: string;
      sellerdashboardHref: string;
      advisordashboardHref: string;
      focusAreasCtaSeller: string;
    },
  ): Record<string, string> {
    if (contextType === 'advisor-introduction') {
      return {
        introGreeting: `Hi ${data.advisorDisplayNameText},`,
        introMessage: `We're excited to introduce you to <strong>${data.sellerCompanyText}</strong>, operating in ${data.sellerIndustryText} across ${data.sellerGeographyText}. ${data.sellerNameText} is eager to speak with you about a potential engagement and asked us to connect you directly.`,
        primaryCtaLabel: this.escapeHtml('Open Advisor Dashboard'),
        primaryCtaUrl: data.advisordashboardHref,
        footerNote: `You are receiving this introduction because ${data.sellerCompanyText} selected you on the Advisor Chooser Platform. Coordinate directly with the seller using the details above.`,
      };
    }

    if (contextType === 'seller-copy') {
      return {
        introGreeting: `Hi ${data.sellerNameText},`,
        introMessage: `Here's is the warm introduction we just shared with <strong>${data.advisorCompanyNameText}</strong>. Reply-all or reach out directly using the advisor's details below to keep the conversation moving.`,
        primaryCtaLabel: this.escapeHtml('Open Seller Dashboard'),
        primaryCtaUrl: data.sellerdashboardHref,
        footerNote: `You're receiving this because you asked us to introduce you to ${data.advisorCompanyNameText}.`,
        focusAreasCta: data.focusAreasCtaSeller ?? '',
      };
    }

    return {
      introGreeting: `Hi ${data.advisorDisplayNameText},`,
      introMessage: `We matched you with <strong>${data.sellerCompanyText}</strong>. They opted to reach out directly, so expect to hear from ${data.sellerNameText} soon. You can also reach them at ${data.sellerEmailText}.`,
      primaryCtaLabel: this.escapeHtml('Open Advisor Dashboard'),
      primaryCtaUrl: data.advisordashboardHref,
      footerNote: `You're receiving this notification because ${data.sellerCompanyText} selected you on Advisor Chooser and chose to handle outreach directly.`,
    };
  }

  private buildIntroductionEmailData(params: {
    advisor: AdvisorDocument;
    advisorUser: any;
    seller: SellerDocument;
    sellerUser: User;
    sellerDashboardUrl: string;
    advisorDashboardUrl: string;
  }): {
    replacements: Record<string, string>;
    contextData: {
      advisorDisplayNameText: string;
      advisorCompanyNameText: string;
      sellerCompanyText: string;
      sellerIndustryText: string;
      sellerGeographyText: string;
      sellerNameText: string;
      sellerEmailText: string;
      sellerdashboardHref: string;
      advisordashboardHref: string;
      focusAreasCtaSeller: string;
    };
    snapshot: {
      sellerAnnualRevenue?: number;
      sellerCurrency?: string;
      sellerContactEmail?: string;
      sellerContactName?: string;
      sellerPhone?: string;
      sellerWebsite?: string;
    };
    raw: {
      advisorCompanyName: string;
      sellerCompanyName: string;
    };
  } {
    const {
      advisor,
      advisorUser,
      seller,
      sellerUser,
      sellerDashboardUrl,
      advisorDashboardUrl,
    } = params;

    const advisordashboardHref = this.escapeAttr(advisorDashboardUrl);
    const sellerdashboardHref = this.escapeAttr(sellerDashboardUrl);

    const advisorCompanyNameRaw =
      advisor.companyName || advisorUser?.name || 'Advisor Company';
    const advisorCompanyNameText = this.escapeHtml(advisorCompanyNameRaw);
    const advisorCompanyNameAttr = this.escapeAttr(advisorCompanyNameRaw);
    const advisorDisplayNameRaw =
      advisorUser?.name?.trim()?.length > 0
        ? advisorUser.name
        : advisorCompanyNameRaw;
    const advisorDisplayNameText = this.escapeHtml(advisorDisplayNameRaw);
    const advisorInitial =
      advisorCompanyNameRaw.trim().charAt(0).toUpperCase() || 'A';

    const advisorIndustriesPreview = this.formatListPreview(advisor.industries);
    const advisorGeographiesPreview = this.formatListPreview(
      advisor.geographies,
    );

    // Advisor description
    const advisorDescriptionRaw =
      (advisor.description && advisor.description.trim()) ||
      'No description provided';
    const advisorDescriptionText = this.escapeHtml(advisorDescriptionRaw);

    const advisorPhoneRaw = advisor.phone?.trim() || '';
    const advisorPhoneText = this.escapeHtml(
      advisorPhoneRaw.length > 0 ? advisorPhoneRaw : 'Not provided',
    );
    const advisorTelHref =
      advisorPhoneRaw.length > 0
        ? this.escapeAttr(`tel:${advisorPhoneRaw.replace(/[^+\d]/g, '')}`)
        : '#';

    const advisorEmailRaw = advisorUser?.email?.trim() || '';
    const advisorEmailText = this.escapeHtml(
      advisorEmailRaw.length > 0 ? advisorEmailRaw : 'Not provided',
    );
    const advisorEmailHref =
      advisorEmailRaw.length > 0
        ? this.escapeAttr(`mailto:${advisorEmailRaw}`)
        : '#';

    const advisorWebsiteRaw = advisor.website?.trim() || '';
    const advisorWebsiteDisplay =
      advisorWebsiteRaw.length > 0
        ? this.escapeHtml(advisorWebsiteRaw)
        : 'Website not provided';
    const advisorWebsiteHref =
      advisorWebsiteRaw.length > 0
        ? this.escapeAttr(
            advisorWebsiteRaw.startsWith('http')
              ? advisorWebsiteRaw
              : `https://${advisorWebsiteRaw}`,
          )
        : '#';

    const yearsExperienceRaw =
      typeof advisor.yearsExperience === 'number'
        ? advisor.yearsExperience.toString()
        : '—';
    const yearsExperienceText = this.escapeHtml(yearsExperienceRaw);

    const numberOfTransactionsRaw =
      typeof advisor.numberOfTransactions === 'number'
        ? advisor.numberOfTransactions.toString()
        : '—';
    const numberOfTransactionsText = this.escapeHtml(numberOfTransactionsRaw);

    // Get advisor revenue range
    const revenueMin = this.formatCurrency(
      advisor.revenueRange?.min,
      advisor.currency,
    );
    const revenueMax = this.formatCurrency(
      advisor.revenueRange?.max,
      advisor.currency,
    );
    let advisorRevenueRangeRaw = 'Not specified';
    if (revenueMin && revenueMax) {
      advisorRevenueRangeRaw = `${revenueMin} – ${revenueMax}`;
    } else if (revenueMin) {
      advisorRevenueRangeRaw = `From ${revenueMin}`;
    } else if (revenueMax) {
      advisorRevenueRangeRaw = `Up to ${revenueMax}`;
    }
    const advisorRevenueRangeText = this.escapeHtml(advisorRevenueRangeRaw);

    // Seller revenue (single value only)
    const sellerRevenueFormatted = this.formatCurrency(
      seller.annualRevenue,
      seller.currency,
    );
    const sellerRevenueRangeText = this.escapeHtml(
      sellerRevenueFormatted || 'Not specified',
    );

    // Seller description
    const sellerDescriptionRaw =
      seller.description?.trim() || 'No description provided';
    const sellerDescriptionText = this.escapeHtml(sellerDescriptionRaw);

    const advisorLogoUrl = advisor.logoUrl?.trim();
    const advisorLogoSrc = advisorLogoUrl
      ? this.escapeAttr(advisorLogoUrl)
      : '';
    const advisorLogoBlock = advisorLogoUrl
      ? `<div style="width:64px; height:64px; border-radius:16px; overflow:hidden; border:2px solid #ffffff; box-shadow:0 12px 28px rgba(79, 70, 229, 0.25);"><img src="${advisorLogoSrc}" alt="${advisorCompanyNameAttr}" style="width:100%; height:100%; object-fit:cover; display:block;" /></div>`
      : `<div style="width:64px; height:64px; border-radius:16px; background:linear-gradient(135deg, #4f46e5, #7c3aed); color:#ffffff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:24px; box-shadow:0 12px 28px rgba(79, 70, 229, 0.2);">${advisorInitial}</div>`;

    // ...existing code...
    const sellerIndustryRaw = seller.industry || 'Not specified';
    const sellerIndustryText = this.escapeHtml(sellerIndustryRaw);
    const sellerGeographyRaw = seller.geography || 'Not specified';
    const sellerGeographyText = this.escapeHtml(sellerGeographyRaw);
    const sellerRevenueDisplayRaw =
      typeof seller.annualRevenue === 'number'
        ? seller.annualRevenue.toLocaleString()
        : 'Not provided';
    const sellerRevenueDisplay = this.escapeHtml(sellerRevenueDisplayRaw);
    const sellerCompanyText = this.escapeHtml(seller.companyName);
    const sellerNameText = this.escapeHtml(sellerUser.name);
    const sellerEmailText = this.escapeHtml(sellerUser.email);

    const focusAreasCtaAdvisor =
      advisorIndustriesPreview.moreCount > 0 ||
      advisorGeographiesPreview.moreCount > 0
        ? `<div style="margin: 12px 10px 0;">
              <a href="${advisordashboardHref}" style="display: inline-block; padding: 8px 18px; border-radius: 999px; background-color: #eef2ff; color: #4f46e5; font-size: 12px; font-weight: 600; text-decoration: none;">Show full focus areas</a>
            </div>`
        : '';

    const focusAreasCtaSeller =
      advisorIndustriesPreview.moreCount > 0 ||
      advisorGeographiesPreview.moreCount > 0
        ? `<div style="margin: 12px 10px 0;">
              <a href="${sellerdashboardHref}" style="display: inline-block; padding: 8px 18px; border-radius: 999px; background-color: #eef2ff; color: #4f46e5; font-size: 12px; font-weight: 600; text-decoration: none;">Open seller dashboard</a>
            </div>`
        : '';

    const sellerAnnualRevenueValue =
      typeof seller.annualRevenue === 'number' &&
      Number.isFinite(seller.annualRevenue)
        ? seller.annualRevenue
        : undefined;
    const sellerCurrencyValue =
      this.sanitizeSnapshotString(seller.currency) || 'USD';
    const sellerContactEmailValue =
      this.sanitizeSnapshotString(seller.contactEmail) ||
      this.sanitizeSnapshotString(sellerUser.email);
    const sellerContactNameValue =
      this.sanitizeSnapshotString(seller.contactName) || sellerUser.name;
    const sellerPhoneValue = this.sanitizeSnapshotString(seller.phone);
    const sellerWebsiteValue = this.sanitizeSnapshotString(seller.website);

    const replacements: Record<string, string> = {
      advisorName: advisorDisplayNameText,
      advisorCompanyName: advisorCompanyNameText,
      advisorLogoBlock,
      advisorYearsExperience: yearsExperienceText,
      advisorNumberOfTransactions: numberOfTransactionsText,
      advisorPhone: advisorPhoneText,
      advisorTelHref,
      advisorEmail: advisorEmailText,
      advisorEmailHref,
      advisorWebsiteText: advisorWebsiteDisplay,
      advisorWebsiteHref,
      advisorRevenueRange: advisorRevenueRangeText, // advisor's own revenue range
      sellerRevenueRange: sellerRevenueRangeText, // seller's revenue range
      advisorDescription: advisorDescriptionText, // advisor's description
      sellerDescription: sellerDescriptionText, // seller's description
      advisorIndustries: advisorIndustriesPreview.previewHtml,
      advisorIndustriesTitle: advisorIndustriesPreview.titleAttr,
      advisorGeographies: advisorGeographiesPreview.previewHtml,
      advisorGeographiesTitle: advisorGeographiesPreview.titleAttr,
      sellerCompany: sellerCompanyText,
      sellerIndustry: sellerIndustryText,
      sellerGeography: sellerGeographyText,
      sellerRevenue: sellerRevenueDisplay,
      sellerName: sellerNameText,
      sellerEmail: sellerEmailText,
      focusAreasCta: focusAreasCtaAdvisor,
    };

    return {
      replacements,
      contextData: {
        advisorDisplayNameText,
        advisorCompanyNameText,
        sellerCompanyText,
        sellerIndustryText,
        sellerGeographyText,
        sellerNameText,
        sellerEmailText,
        sellerdashboardHref,
        advisordashboardHref,
        focusAreasCtaSeller,
      },
      snapshot: {
        sellerAnnualRevenue: sellerAnnualRevenueValue,
        sellerCurrency: sellerCurrencyValue,
        sellerContactEmail: sellerContactEmailValue,
        sellerContactName: sellerContactNameValue,
        sellerPhone: sellerPhoneValue,
        sellerWebsite: sellerWebsiteValue,
      },
      raw: {
        advisorCompanyName: advisorCompanyNameRaw,
        sellerCompanyName: seller.companyName,
      },
    };
  }

  // Sends professional introduction emails to selected advisors, copying the seller
  async sendIntroductions(
    userId: string,
    introductionDto: IntroductionDto,
  ): Promise<{ message: string; emailsSent: number }> {
    // Get seller profile and user details
    const seller = await this.sellerModel
      .findOne({ userId })
      .populate('userId');
    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    const sellerUser = await this.userModel.findById(userId);
    if (!sellerUser) {
      throw new NotFoundException('Seller user not found');
    }

    // Validate that selected advisors are from current matches
    const matches = await this.matchingService.findMatches(userId);
    const matchedIds = matches.map((m) => m.id);
    const invalidIds = introductionDto.advisorIds.filter(
      (id) => !matchedIds.includes(id),
    );

    if (invalidIds.length > 0) {
      throw new BadRequestException(
        'Some advisor IDs are not from your current matches',
      );
    }

    // Get selected advisors with user details
    const selectedAdvisors = await this.advisorModel
      .find({
        _id: { $in: introductionDto.advisorIds },
      })
      .populate('userId');

    if (selectedAdvisors.length === 0) {
      throw new NotFoundException('No valid advisors found');
    }

    // Load email template
    const templatePath = path.join(
      process.cwd(),
      'templates',
      'introduction.hbs',
    );
    let template = '';
    try {
      template = fs.readFileSync(templatePath, 'utf8');
    } catch (error) {
      throw new Error('Email template not found');
    }

    const frontendUrl =
      process.env.FRONTEND_URL?.replace(/\/$/, '') ||
      'https://frontend-five-pied-17.vercel.app';
    const SellerdashboardUrl = `${frontendUrl}/seller-login`;
    const AdvisordashboardUrl = `${frontendUrl}/advisor-login`;

    let emailsSent = 0;

    // Send introduction email to each selected advisor
    for (const advisor of selectedAdvisors) {
      const advisorUser = advisor.userId as any;

      const emailData = this.buildIntroductionEmailData({
        advisor,
        advisorUser,
        seller,
        sellerUser,
        sellerDashboardUrl: SellerdashboardUrl,
        advisorDashboardUrl: AdvisordashboardUrl,
      });

      const advisorHtml = this.applyTemplate(template, {
        ...emailData.replacements,
        ...this.buildIntroductionContext(
          'advisor-introduction',
          emailData.contextData,
        ),
      });

      const sellerCopyHtml = this.applyTemplate(template, {
        ...emailData.replacements,
        ...this.buildIntroductionContext('seller-copy', emailData.contextData),
      });

      try {
        await this.emailService.sendEmail({
          to: advisorUser?.email,
          subject: `New Client Introduction - ${emailData.raw.sellerCompanyName}`,
          html: advisorHtml,
        });

        await this.connectionModel.create({
          sellerId: seller.userId._id,
          advisorId: advisor._id,
          type: ConnectionType.INTRODUCTION,
          sellerCompanyName: seller.companyName,
          sellerIndustry: seller.industry,
          sellerGeography: seller.geography,
          sellerAnnualRevenue: emailData.snapshot.sellerAnnualRevenue,
          sellerCurrency: emailData.snapshot.sellerCurrency,
          sellerContactEmail: emailData.snapshot.sellerContactEmail,
          sellerContactName: emailData.snapshot.sellerContactName,
          sellerPhone: emailData.snapshot.sellerPhone,
          sellerWebsite: emailData.snapshot.sellerWebsite,
        });

        try {
          await this.emailService.sendEmail({
            to: sellerUser.email,
            subject: `Introduction sent to ${emailData.raw.advisorCompanyName}`,
            html: sellerCopyHtml,
          });
        } catch (sellerError) {
          console.error(
            `Failed to send introduction copy to seller ${sellerUser.email}:`,
            sellerError,
          );
        }

        emailsSent++;
      } catch (error) {
        console.error(`Failed to send email to ${advisorUser?.email}:`, error);
      }
    }

    return {
      message: `Introduction emails sent to ${emailsSent} advisors`,
      emailsSent,
    };
  }

  // Sends direct contact list to seller without notifying advisors
  async sendDirectContactList(
    userId: string,
  ): Promise<{ message: string; advisorCount: number }> {
    // Get seller profile and user details
    const seller = await this.sellerModel
      .findOne({ userId })
      .populate('userId');
    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    const sellerUser = await this.userModel.findById(userId);
    if (!sellerUser) {
      throw new NotFoundException('Seller user not found');
    }

    // Get all matched advisors
    const matches = await this.matchingService.findMatches(userId);
    if (matches.length === 0) {
      throw new NotFoundException('No matching advisors found');
    }

    // Get full advisor details with user info
    const advisors = await this.advisorModel
      .find({
        _id: { $in: matches.map((m) => m.id) },
      })
      .populate('userId');

    // Load templates
    const directListTemplate = fs.readFileSync(
      path.join(process.cwd(), 'templates', 'direct-list.hbs'),
      'utf8',
    );

    const introductionTemplatePath = path.join(
      process.cwd(),
      'templates',
      'introduction.hbs',
    );
    let introductionTemplate = '';
    try {
      introductionTemplate = fs.readFileSync(introductionTemplatePath, 'utf8');
    } catch (error) {
      throw new Error('Introduction email template not found');
    }

    const frontendUrl =
      process.env.FRONTEND_URL?.replace(/\/$/, '') ||
      'https://frontend-five-pied-17.vercel.app';
    const SellerdashboardUrl = `${frontendUrl}/seller-login`;
    const AdvisordashboardUrl = `${frontendUrl}/advisor-login`;

    const formatCurrencyValue = (
      value: number | undefined,
      currencyCode?: string,
    ) => {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return null;
      }
      try {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currencyCode || 'USD',
          maximumFractionDigits: 0,
        }).format(value);
      } catch (error) {
        return value.toLocaleString();
      }
    };

    const escapeHtml = (value: string) =>
      value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapeAttr = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const formatListPreview = (
      values: (string | null | undefined)[] | undefined,
      maxVisible = 3,
    ): {
      previewHtml: string;
      titleAttr: string;
      moreCount: number;
    } => {
      const normalized =
        values
          ?.map((value) => value?.trim())
          .filter((value): value is string => Boolean(value)) ?? [];

      if (normalized.length === 0) {
        const fallback = 'Not specified';
        return {
          previewHtml: escapeHtml(fallback),
          titleAttr: escapeAttr(fallback),
          moreCount: 0,
        };
      }

      const previewItems = normalized.slice(0, maxVisible);
      const previewText = previewItems.join(', ');
      const basePreviewHtml = escapeHtml(previewText);
      const moreCount = Math.max(normalized.length - previewItems.length, 0);
      const fullListAttr = escapeAttr(normalized.join(', '));

      if (moreCount === 0) {
        return {
          previewHtml: basePreviewHtml,
          titleAttr: fullListAttr,
          moreCount,
        };
      }

      const extraBadge = ` <span style="color:#4f46e5; font-weight:600;">+${moreCount} more</span>`;
      return {
        previewHtml: `${basePreviewHtml}${extraBadge}`,
        titleAttr: fullListAttr,
        moreCount,
      };
    };

    const sellerDashboardHref = escapeAttr(SellerdashboardUrl);

    const advisorListHtml = advisors
      .map((advisor) => {
        const advisorUser = advisor.userId as any;
        const companyName = advisor.companyName?.trim() || 'Advisor Company';
        const companyNameHtml = escapeHtml(companyName);
        const companyNameAttr = escapeAttr(companyName);
        const advisorLogoUrl = advisor.logoUrl?.trim();
        const advisorInitial = companyName.charAt(0).toUpperCase() || 'A';
        const logoSrc = advisorLogoUrl ? escapeAttr(advisorLogoUrl) : '';
        const logoHtml = advisorLogoUrl
          ? `<div style="width:60px; height:60px; border-radius:16px; overflow:hidden; border:2px solid #ffffff; box-shadow:0 12px 28px rgba(79, 70, 229, 0.18);"><img src="${logoSrc}" alt="${companyNameAttr}" style="width:100%; height:100%; object-fit:cover; display:block;" /></div>`
          : `<div style="width:60px; height:60px; border-radius:16px; background:linear-gradient(135deg, #4f46e5, #7c3aed); color:#ffffff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:22px; box-shadow:0 12px 28px rgba(79, 70, 229, 0.18);">${advisorInitial}</div>`;

        const contactName = advisorUser?.name?.trim() || companyName;
        const contactNameHtml = escapeHtml(contactName);
        const phoneRaw = advisor.phone?.trim() || '';
        const phoneDisplay = phoneRaw || 'Not provided';
        const emailRaw = advisorUser?.email?.trim() || '';
        const emailDisplay = emailRaw || 'Not provided';
        const websiteRaw = advisor.website?.trim() || '';
        const websiteLink =
          websiteRaw.length > 0
            ? websiteRaw.startsWith('http')
              ? websiteRaw
              : `https://${websiteRaw}`
            : '#';
        const websiteHref =
          websiteRaw.length > 0 ? escapeAttr(websiteLink) : '#';
        const websiteDisplay =
          websiteRaw.length > 0
            ? escapeHtml(websiteRaw)
            : 'Website not provided';

        const industriesPreview = formatListPreview(advisor.industries);
        const geographiesPreview = formatListPreview(advisor.geographies);
        const descriptionText = advisor.description?.trim().length
          ? escapeHtml(advisor.description)
          : 'No description provided';
        const yearsExperience =
          typeof advisor.yearsExperience === 'number'
            ? advisor.yearsExperience.toString()
            : '—';
        const dealsCount =
          typeof advisor.numberOfTransactions === 'number'
            ? advisor.numberOfTransactions.toString()
            : '—';

        const minRevenue = formatCurrencyValue(
          advisor.revenueRange?.min,
          advisor.currency,
        );
        const maxRevenue = formatCurrencyValue(
          advisor.revenueRange?.max,
          advisor.currency,
        );
        let revenueRange = 'Not specified';
        if (minRevenue && maxRevenue) {
          revenueRange = `${minRevenue} – ${maxRevenue}`;
        } else if (minRevenue) {
          revenueRange = `From ${minRevenue}`;
        } else if (maxRevenue) {
          revenueRange = `Up to ${maxRevenue}`;
        }
        const revenueRangeHtml = escapeHtml(revenueRange);

        const mailtoHref = emailRaw ? escapeAttr(`mailto:${emailRaw}`) : '#';
        const telHref = phoneRaw
          ? escapeAttr(`tel:${phoneRaw.replace(/[^+\d]/g, '')}`)
          : '#';

        const focusAreasCta =
          industriesPreview.moreCount > 0 || geographiesPreview.moreCount > 0
            ? `<div style="margin: 10px 8px 0;">
                <a href="${sellerDashboardHref}" style="display: inline-block; padding: 8px 16px; border-radius: 999px; background-color: #eef2ff; color: #4f46e5; font-size: 12px; font-weight: 600; text-decoration: none;">Show full focus areas</a>
              </div>`
            : '';

        return `
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: separate; border-spacing: 0; margin-bottom: 24px;">
            <tr>
              <td style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 20px; overflow: hidden; box-shadow: 0 18px 44px rgba(15, 23, 42, 0.08);">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
                  <tr>
                    <td style="background: linear-gradient(135deg, #eef2ff 0%, #f0f9ff 100%); padding: 24px 28px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
                        <tr>
                          <td style="width: 68px; vertical-align: top;">
                            ${logoHtml}
                          </td>
                          <td style="padding-left: 18px;">
                            <p style="margin: 0; color: #6366f1; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;">Advisor Match</p>
                            <h3 style="margin: 8px 0 6px; font-size: 20px; line-height: 1.3; font-weight: 700; color: #111827;">${companyNameHtml}</h3>
                            <p style="margin: 0 0 6px; font-size: 13px; color: #4b5563;">Primary contact: <strong style="color: #111827;">${contactNameHtml}</strong></p>
                            <p style="margin: 0; font-size: 12px; color: #6b7280;">${yearsExperience} years experience · ${dealsCount} closed deals</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 22px 28px 16px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
                        <tr>
                          <td style="width: 33.33%; padding: 8px;">
                            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 14px; padding: 12px; height: 100%;">
                              <p style="margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #9ca3af; font-weight: 600;">Phone</p>
                              <p style="margin: 6px 0 0; font-size: 13px; color: #111827; font-weight: 600;">${escapeHtml(phoneDisplay)}</p>
                              <p style="margin: 6px 0 0; font-size: 11px;"><a href="${telHref}" style="color: #6366f1; text-decoration: none;">Call advisor</a></p>
                            </div>
                          </td>
                          <td style="width: 33.33%; padding: 8px;">
                            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 14px; padding: 12px; height: 100%;">
                              <p style="margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #9ca3af; font-weight: 600;">Email</p>
                              <p style="margin: 6px 0 0; font-size: 13px; color: #111827; font-weight: 600; word-break: break-all;">${escapeHtml(emailDisplay)}</p>
                              <p style="margin: 6px 0 0; font-size: 11px;"><a href="${mailtoHref}" style="color: #6366f1; text-decoration: none;">Email advisor</a></p>
                            </div>
                          </td>
                          <td style="width: 33.33%; padding: 8px;">
                            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 14px; padding: 12px; height: 100%;">
                              <p style="margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #9ca3af; font-weight: 600;">Website</p>
                              <p style="margin: 6px 0 0; font-size: 13px; font-weight: 600; word-break: break-all;"><a href="${websiteHref}" style="color: #4f46e5; text-decoration: none;">${websiteDisplay}</a></p>
                            </div>
                          </td>
                        </tr>
                      </table>

                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-top: 6px;">
                        <tr>
                          <td style="width: 50%; padding: 8px;">
                            <div style="background-color: #eef2ff; border: 1px solid #c7d2fe; border-radius: 14px; padding: 14px; height: 100%;">
                              <p style="margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #4338ca; font-weight: 700;">Focus Industries</p>
                              <p style="margin: 6px 0 0; font-size: 13px; color: #1f2937; line-height: 1.6;" title="${industriesPreview.titleAttr}">${industriesPreview.previewHtml}</p>
                            </div>
                          </td>
                          <td style="width: 50%; padding: 8px;">
                            <div style="background-color: #ecfdf5; border: 1px solid #bbf7d0; border-radius: 14px; padding: 14px; height: 100%;">
                              <p style="margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #047857; font-weight: 700;">Geographic Coverage</p>
                              <p style="margin: 6px 0 0; font-size: 13px; color: #1f2937; line-height: 1.6;" title="${geographiesPreview.titleAttr}">${geographiesPreview.previewHtml}</p>
                            </div>
                          </td>
                        </tr>
                      </table>

                      ${focusAreasCta}

                      <div style="background-color: #ecfdf5; border: 1px solid #bbf7d0; border-radius: 16px; padding: 18px; margin: 16px 0 14px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
                          <tr>
                            <td style="vertical-align: top;">
                              <p style="margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #047857; font-weight: 700;">Typical Client Revenue</p>
                              <p style="margin: 8px 0 0; font-size: 16px; color: #065f46; font-weight: 700;">${revenueRangeHtml}</p>
                            </td>
                            <td style="text-align: right; vertical-align: middle;">
                              <span style="display: inline-block; padding: 6px 12px; border-radius: 999px; background-color: #d1fae5; color: #047857; font-size: 11px; font-weight: 700;">Strong alignment</span>
                            </td>
                          </tr>
                        </table>
                      </div>

                      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 16px; padding: 18px;">
                        <p style="margin: 0 0 8px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; font-weight: 700;">About the advisor</p>
                        <p style="margin: 0; font-size: 13px; line-height: 1.7; color: #1f2937;">${descriptionText}</p>
                      </div>

                      <div style="text-align: center; padding: 18px 0 4px;">
                        <a href="${mailtoHref}" style="display: inline-block; padding: 12px 28px; border-radius: 999px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none;">Email ${companyNameHtml}</a>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        `;
      })
      .join('');

    const pluralLabel = matches.length === 1 ? '' : 's';
    const sellerNameHtml = escapeHtml(sellerUser.name);
    const sellerDashboardLink = escapeAttr(SellerdashboardUrl);
    const advisorDashboardLink = escapeAttr(AdvisordashboardUrl);
    const listEmailHtml = directListTemplate
      .replace(/{{sellerName}}/g, sellerNameHtml)
      .replace(/{{advisorCount}}/g, matches.length.toString())
      .replace(/{{pluralLabel}}/g, pluralLabel)
      .replace(/{{SellerdashboardUrl}}/g, sellerDashboardLink)
      .replace(/{{AdvisordashboardUrl}}/g, advisorDashboardLink)
      .replace(/{{advisorList}}/g, advisorListHtml);

    try {
      await this.emailService.sendEmail({
        to: sellerUser.email,
        subject: `Your Matched Advisors Contact List`,
        html: listEmailHtml,
      });
    } catch (error) {
      console.error('Failed to send contact list to seller:', error);
    }

    for (const advisor of advisors) {
      const advisorUser = advisor.userId as any;

      const emailData = this.buildIntroductionEmailData({
        advisor,
        advisorUser,
        seller,
        sellerUser,
        sellerDashboardUrl: SellerdashboardUrl,
        advisorDashboardUrl: AdvisordashboardUrl,
      });

      const advisorHtml = this.applyTemplate(introductionTemplate, {
        ...emailData.replacements,
        ...this.buildIntroductionContext('direct-list', emailData.contextData),
      });

      try {
        await this.emailService.sendEmail({
          to: advisorUser?.email,
          subject: `Advisor Chooser Match: ${emailData.raw.sellerCompanyName} will reach out directly`,
          html: advisorHtml,
        });

        await this.connectionModel.create({
          sellerId: seller.userId._id,
          advisorId: advisor._id,
          type: ConnectionType.DIRECT_LIST,
          sellerCompanyName: seller.companyName,
          sellerIndustry: seller.industry,
          sellerGeography: seller.geography,
          sellerAnnualRevenue: emailData.snapshot.sellerAnnualRevenue,
          sellerCurrency: emailData.snapshot.sellerCurrency,
          sellerContactEmail: emailData.snapshot.sellerContactEmail,
          sellerContactName: emailData.snapshot.sellerContactName,
          sellerPhone: emailData.snapshot.sellerPhone,
          sellerWebsite: emailData.snapshot.sellerWebsite,
        });
      } catch (error) {
        console.error(
          `Failed to send direct outreach notice to ${advisorUser?.email}:`,
          error,
        );
      }
    }

    return {
      message: 'Contact list sent to seller',
      advisorCount: matches.length,
    };
  }
}
