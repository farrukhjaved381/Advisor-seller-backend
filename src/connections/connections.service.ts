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
      sellerFirstNameText: string;
      sellerdashboardHref: string;
      advisordashboardHref: string;
      focusAreasCtaSeller: string;
      heroTitleText: string;
    },
  ): Record<string, string> {
    if (contextType === 'advisor-introduction') {
      // const primaryCtaSection = `
      //   <div style="text-align: center; margin-bottom: 18px;">
      //     <a href="${data.advisordashboardHref}" style="display: inline-block; padding: 14px 28px; border-radius: 999px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none;">${this.escapeHtml('Open Advisor Dashboard')}</a>
      //   </div>
      // `.trim();
      const primaryCtaSection = '';

      return {
        heroTitle: data.heroTitleText,
        heroSubtitle: '',
        introGreeting: `Hi ${data.advisorDisplayNameText},`,
        introMessage: `We are very excited to introduce you to ${data.sellerNameText} from ${data.sellerCompanyText}.<br /><br />Please reach out to ${data.sellerFirstNameText} and set up a time to meet.`,
        primaryCtaSection,
        footerNote: `You are receiving this introduction because ${data.sellerCompanyText} selected you on the Advisor Chooser Platform. Coordinate directly with the seller using the details above.`,
      };
    }

    if (contextType === 'seller-copy') {
      return {
        heroTitle: data.heroTitleText,
        heroSubtitle: '',
        introGreeting: `Hi ${data.sellerNameText},`,
        introMessage: `We are very excited to introduce you to ${data.sellerNameText} from ${data.sellerCompanyText}.<br /><br />Please reach out to ${data.sellerFirstNameText} and set up a time to meet.`,
        primaryCtaSection: '',
        footerNote: `You're receiving this because you asked us to introduce you to ${data.advisorCompanyNameText}.`,
      };
    }

    const directListCtaSection = `
      <div style="text-align: center; margin-bottom: 18px;">
        <a href="${data.advisordashboardHref}" style="display: inline-block; padding: 14px 28px; border-radius: 999px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none;">${this.escapeHtml('Open Advisor Dashboard')}</a>
      </div>
    `.trim();

    return {
      heroTitle: 'Advisor Chooser Match: The seller has opted to reach out directly.',
      heroSubtitle: '',
      introGreeting: `Hi ${data.advisorDisplayNameText},`,
      introMessage:
        'We matched you with a potential client! The seller has opted to reach out to you directly, so expect to hear from someone that will mention finding you on Advisor Chooser.<br /><br />To see all you matches and manage your profile, head to your Advisor Chooser dashboard.',
      contactSection: '',
      advisorDetailsSection: '',
      sellerDetailsSection: '',
      nextStepsSection: '',
      primaryCtaSection: directListCtaSection,
      footerNote: '',
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
      sellerFirstNameText: string;
      sellerdashboardHref: string;
      advisordashboardHref: string;
      focusAreasCtaSeller: string;
      heroTitleText: string;
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

    // Seller revenue (single value) and description
    const sellerDescriptionRaw =
      (seller.description && seller.description.trim()) ||
      'No description provided';
    const sellerDescriptionText = this.escapeHtml(sellerDescriptionRaw);

    const sellerRevenueFormatted =
      typeof seller.annualRevenue === 'number'
        ? this.formatCurrency(seller.annualRevenue, seller.currency)
        : null;
    const sellerRevenueRangeRaw = sellerRevenueFormatted || 'Not specified';
    const sellerRevenueRangeText = this.escapeHtml(sellerRevenueRangeRaw);

    const advisorLogoUrl = advisor.logoUrl?.trim();
    const advisorLogoSrc = advisorLogoUrl
      ? this.escapeAttr(advisorLogoUrl)
      : '';
    const advisorLogoBlock = advisorLogoUrl
      ? `<div style="width:64px; height:64px; border-radius:16px; overflow:hidden; border:2px solid #ffffff; box-shadow:0 12px 28px rgba(79, 70, 229, 0.25);"><img src="${advisorLogoSrc}" alt="${advisorCompanyNameAttr}" style="width:100%; height:100%; object-fit:cover; display:block;" /></div>`
      : `<div style="width:64px; height:64px; border-radius:16px; background:linear-gradient(135deg, #4f46e5, #7c3aed); color:#ffffff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:24px; box-shadow:0 12px 28px rgba(79, 70, 229, 0.2);">${advisorInitial}</div>`;

    // Seller details for messaging
    const sellerIndustryRaw = seller.industry || 'Not specified';
    const sellerIndustryText = this.escapeHtml(sellerIndustryRaw);
    const sellerGeographyRaw = seller.geography || 'Not specified';
    const sellerGeographyText = this.escapeHtml(sellerGeographyRaw);
    const sellerRevenueDisplayRaw =
      typeof seller.annualRevenue === 'number'
        ? seller.annualRevenue.toLocaleString()
        : 'Not provided';
    const sellerRevenueDisplay = this.escapeHtml(sellerRevenueDisplayRaw);

    const sellerCompanyNameRaw =
      this.sanitizeSnapshotString(seller.companyName) || 'Company for sale';
    const sellerCompanyText = this.escapeHtml(sellerCompanyNameRaw);

    const sellerUserNameRaw =
      typeof sellerUser?.name === 'string' ? sellerUser.name.trim() : '';
    const sellerContactNameValue =
      this.sanitizeSnapshotString(seller.contactName) || sellerUserNameRaw;
    const sellerDisplayNameRaw = sellerContactNameValue || sellerCompanyNameRaw;
    const sellerNameText = this.escapeHtml(sellerDisplayNameRaw);

    const sellerFirstNameText = this.escapeHtml(sellerDisplayNameRaw);

    const sellerPrimaryEmailRaw =
      this.sanitizeSnapshotString(seller.contactEmail) ||
      this.sanitizeSnapshotString(sellerUser.email);
    const sellerContactEmailValue = sellerPrimaryEmailRaw;
    const sellerEmailText = this.escapeHtml(
      sellerPrimaryEmailRaw || sellerUser.email || 'Not provided',
    );

    const advisorCompanyNameForTitle =
      this.sanitizeSnapshotString(advisorCompanyNameRaw) || 'Advisor Company';
    const heroTitleRaw = `Advisor Chooser Introduction: ${sellerCompanyNameRaw} <> ${advisorCompanyNameForTitle}`;
    const heroTitleText = this.escapeHtml(heroTitleRaw);

    const sellerAnnualRevenueValue =
      typeof seller.annualRevenue === 'number' &&
      Number.isFinite(seller.annualRevenue)
        ? seller.annualRevenue
        : undefined;
    const sellerCurrencyValue =
      this.sanitizeSnapshotString(seller.currency) || 'USD';

    const sellerPhoneValue = this.sanitizeSnapshotString(seller.phone);
    const sellerWebsiteValue = this.sanitizeSnapshotString(seller.website);

    const sellerContactNameText = this.escapeHtml(sellerDisplayNameRaw);
    const sellerContactEmailText = this.escapeHtml(
      sellerPrimaryEmailRaw || sellerUser.email || 'Not provided',
    );

    const sellerPhoneDisplay = this.escapeHtml(
      sellerPhoneValue || 'Not provided',
    );
    const sellerPhoneHref = sellerPhoneValue
      ? this.escapeAttr(`tel:${sellerPhoneValue.replace(/[^+\d]/g, '')}`)
      : '#';

    const sellerEmailHref = sellerPrimaryEmailRaw
      ? this.escapeAttr(`mailto:${sellerPrimaryEmailRaw}`)
      : '#';

    let sellerWebsiteHref = '#';
    let sellerWebsiteDisplay = this.escapeHtml('Not provided');
    if (sellerWebsiteValue) {
      const normalizedWebsite = sellerWebsiteValue.startsWith('http')
        ? sellerWebsiteValue
        : `https://${sellerWebsiteValue}`;
      sellerWebsiteHref = this.escapeAttr(normalizedWebsite);
      sellerWebsiteDisplay = this.escapeHtml(
        sellerWebsiteValue.replace(/^https?:\/\//, ''),
      );
    }
    const sellerWebsiteText = sellerWebsiteDisplay;

    const phoneContent = sellerPhoneValue
      ? `<a href="${sellerPhoneHref}" style="color: #111827; text-decoration: none;">${sellerPhoneDisplay}</a>`
      : sellerPhoneDisplay;
    const emailContent = sellerPrimaryEmailRaw
      ? `<a href="${sellerEmailHref}" style="color: #111827; text-decoration: none;">${sellerContactEmailText}</a>`
      : sellerContactEmailText;
    const websiteContent = sellerWebsiteValue
      ? `<a href="${sellerWebsiteHref}" style="color: #4f46e5; text-decoration: none;">${sellerWebsiteDisplay}</a>`
      : sellerWebsiteDisplay;

    const contactSectionHtml = '';

    const overviewSectionHtml = `
      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 16px; padding: 20px; margin-bottom: 20px;">
        <p style="margin: 0 0 10px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; font-weight: 700;">Company Overview</p>
        <p style="margin: 0; font-size: 13px; line-height: 1.7; color: #1f2937;">${sellerDescriptionText}</p>
      </div>
    `.trim();

    // const revenueSectionHtml = `
    //   <div style="background-color: #ecfdf5; border: 1px solid #bbf7d0; border-radius: 16px; padding: 18px; margin-bottom: 20px;">
    //     <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
    //       <tr>
    //         <td style="vertical-align: top;">
    //           <p style="margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #047857; font-weight: 700;">Annual Revenue</p>
    //           <p style="margin: 8px 0 0; font-size: 16px; color: #065f46; font-weight: 700;">${sellerRevenueRangeText}</p>
    //         </td>
    //       </tr>
    //     </table>
    //   </div>
    // `.trim();
    const revenueSectionHtml = '';

    // const marketSectionHtml = `
    //   <div style="background-color: #eef2ff; border: 1px solid #c7d2fe; border-radius: 16px; padding: 18px;">
    //     <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
    //       <tr>
    //         <td style="width: 50%; padding-right: 12px;">
    //           <p style="margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #4338ca; font-weight: 700;">Industry</p>
    //           <p style="margin: 6px 0 0; font-size: 13px; color: #1f2937;">${sellerIndustryText}</p>
    //         </td>
    //         <td style="width: 50%; padding-left: 12px;">
    //           <p style="margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #4338ca; font-weight: 700;">Location</p>
    //           <p style="margin: 6px 0 0; font-size: 13px; color: #1f2937;">${sellerGeographyText}</p>
    //         </td>
    //       </tr>
    //     </table>
    //   </div>
    // `.trim();
    const marketSectionHtml = '';

    const advisorDetailsSectionHtml = `
      ${overviewSectionHtml}
    `;

    const nextStepsSectionHtml = '';

    const focusAreasCtaAdvisor = '';
    const focusAreasCtaSeller = '';
    const snapshotSection = `
      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 16px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 12px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6366f1; font-weight: 700;">Snapshot</p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
          <tr>
            <td style="width: 40%; padding: 6px 0; font-size: 13px; font-weight: 600; color: #4b5563;">Company</td>
            <td style="padding: 6px 0; font-size: 13px; color: #1f2937;">${sellerCompanyText}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #4b5563;">Name</td>
            <td style="padding: 6px 0; font-size: 13px; color: #1f2937;">${sellerContactNameText}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #4b5563;">Email</td>
            <td style="padding: 6px 0; font-size: 13px; color: #1f2937;">${sellerContactEmailText}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #4b5563;">Annual Revenue</td>
            <td style="padding: 6px 0; font-size: 13px; color: #1f2937;">${sellerRevenueRangeText}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #4b5563;">Industry</td>
            <td style="padding: 6px 0; font-size: 13px; color: #1f2937;">${sellerIndustryText}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #4b5563;">Location</td>
            <td style="padding: 6px 0; font-size: 13px; color: #1f2937;">${sellerGeographyText}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #4b5563;">Website</td>
            <td style="padding: 6px 0; font-size: 13px; color: #1f2937;">${sellerWebsiteText}</td>
          </tr>
        </table>
      </div>
    `.trim();

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
      contactSection: contactSectionHtml,
      advisorDetailsSection: advisorDetailsSectionHtml,
      sellerDetailsSection: snapshotSection,
      nextStepsSection: nextStepsSectionHtml,
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
        sellerFirstNameText,
        sellerdashboardHref,
        advisordashboardHref,
        focusAreasCtaSeller,
        heroTitleText,
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
      'https://app.advisorchooser.com';
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
        // Send introduction email to advisor with seller CC'd
        await this.emailService.sendEmail({
          to: advisorUser?.email,
          cc: sellerUser.email, // CC the seller on the advisor's email
          subject: `Advisor Chooser Introduction: ${emailData.raw.sellerCompanyName} <> ${emailData.raw.advisorCompanyName}`,
          html: advisorHtml,
        });

        const connection = await this.connectionModel.create({
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
        console.log('[ConnectionsService] Created INTRODUCTION connection:', {
          connectionId: connection._id,
          sellerId: seller.userId._id.toString(),
          advisorId: (advisor._id as any).toString(),
          advisorUserId: advisorUser?._id?.toString(),
          type: ConnectionType.INTRODUCTION,
        });

        // COMMENTED OUT: No longer sending separate email to seller
        // Seller now receives the same email via CC
        // try {
        //   await this.emailService.sendEmail({
        //     to: sellerUser.email,
        //     subject: `Advisor Chooser Introduction:${emailData.raw.sellerCompanyName} <> ${emailData.raw.advisorCompanyName}`,
        //     html: sellerCopyHtml,
        //   });
        // } catch (sellerError) {
        //   console.error(
        //     `Failed to send introduction copy to seller ${sellerUser.email}:`,
        //     sellerError,
        //   );
        // }

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

    const directOutreachTemplatePath = path.join(
      process.cwd(),
      'templates',
      'direct-outreach.hbs',
    );
    let directOutreachTemplate = '';
    try {
      directOutreachTemplate = fs.readFileSync(directOutreachTemplatePath, 'utf8');
    } catch (error) {
      throw new Error('Direct outreach email template not found');
    }

    const frontendUrl =
      process.env.FRONTEND_URL?.replace(/\/$/, '') ||
      'https://app.advisorchooser.com';
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
          ? `<div style="width:64px; height:64px; border-radius:18px; overflow:hidden; border:2px solid #ffffff; box-shadow:0 14px 34px rgba(79, 70, 229, 0.22);"><img src="${logoSrc}" alt="${companyNameAttr}" style="width:100%; height:100%; object-fit:cover; display:block;" /></div>`
          : `<div style="width:64px; height:64px; border-radius:18px; background:linear-gradient(135deg, #4f46e5, #7c3aed); color:#ffffff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:24px; box-shadow:0 14px 34px rgba(79, 70, 229, 0.22);">${advisorInitial}</div>`;

        const contactName = advisorUser?.name?.trim() || companyName;
        const contactNameHtml = escapeHtml(contactName);
        const phoneRaw = advisor.phone?.trim() || '';
        const phoneDisplay =
          phoneRaw.length > 0 ? escapeHtml(phoneRaw) : 'Not provided';
        const emailRaw = advisorUser?.email?.trim() || '';
        const emailDisplay =
          emailRaw.length > 0 ? escapeHtml(emailRaw) : 'Not provided';
        const websiteRaw = advisor.website?.trim() || '';
        const normalizedWebsite =
          websiteRaw.length > 0
            ? websiteRaw.startsWith('http')
              ? websiteRaw
              : `https://${websiteRaw}`
            : '';
        const websiteHref =
          normalizedWebsite.length > 0 ? escapeAttr(normalizedWebsite) : '#';
        const websiteDisplay =
          websiteRaw.length > 0
            ? escapeHtml(websiteRaw.replace(/^https?:\/\//, ''))
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

        const metrics: string[] = [];
        if (yearsExperience !== '—') {
          metrics.push(
            `<span style="display:flex; align-items:center; gap:8px;">🕒 <strong>${escapeHtml(yearsExperience)}</strong> years experience</span>`,
          );
        }
        if (dealsCount !== '—') {
          metrics.push(
            `<span style="display:flex; align-items:center; gap:8px;">📈 <strong>${escapeHtml(dealsCount)}</strong> closed deals</span>`,
          );
        }
        // if (phoneRaw.length > 0) {
        //   const telHref = escapeAttr(`tel:${phoneRaw.replace(/[^+\d]/g, '')}`);
        //   metrics.push(
        //     `<span style="display:flex; align-items:center; gap:8px;">📞 <a href="${telHref}" style="color:#1f2937; text-decoration:none;">${phoneDisplay}</a></span>`,
        //   );
        // }
        // if (emailRaw.length > 0) {
        //   const mailtoHref = escapeAttr(`mailto:${emailRaw}`);
        //   metrics.push(
        //     `<span style="display:flex; align-items:center; gap:8px;">✉️ <a href="${mailtoHref}" style="color:#1f2937; text-decoration:none;">${emailDisplay}</a></span>`,
        //   );
        // }
        // if (normalizedWebsite.length > 0) {
        //   metrics.push(
        //     `<span style="display:flex; align-items:center; gap:8px;">🔗 <a href="${websiteHref}" style="color:#4f46e5; text-decoration:none;">${websiteDisplay}</a></span>`,
        //   );
        // }

        const metricsHtml =
          metrics.length > 0
            ? `<div style="display:flex; flex-wrap:wrap; gap:12px; margin-top:12px; font-size:12px; color:#4b5563;">${metrics.join(
                '<span style="width:12px; display:block;"></span>',
              )}</div>`
            : '';

        return `
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: separate; border-spacing: 0; margin-bottom: 28px;">
            <tr>
              <td style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 20px; overflow: hidden; box-shadow: 0 22px 44px rgba(15, 23, 42, 0.08);">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
                  <tr>
                    <td style="background: linear-gradient(135deg, #eef2ff 0%, #f0f9ff 100%); padding: 28px 32px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
                        <tr>
                          <td style="width: 72px; vertical-align: top;">
                            ${logoHtml}
                          </td>
                          <td style="padding-left: 20px;">
                            <p style="margin: 0; color: #6366f1; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;">Advisor Match</p>
                            <h3 style="margin: 10px 0 6px; font-size: 20px; line-height: 1.3; font-weight: 700; color: #111827;">${companyNameHtml}</h3>
                            <p style="margin: 0 0 6px; font-size: 13px; color: #4b5563;">Owner name: <strong style="color: #111827;">${contactNameHtml}</strong></p>
                            ${metricsHtml}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 26px 32px 24px;">
                      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 16px; padding: 18px; margin-bottom: 18px;">
                        <p style="margin: 0 0 8px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; font-weight: 700;">About this advisor</p>
                        <p style="margin: 0; font-size: 13px; line-height: 1.7; color: #1f2937;">${descriptionText}</p>
                      </div>

                      ${
                        /*<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-bottom: 18px;">
                        <tr>
                          <td style="width: 50%; padding-right: 12px;">
                            <div style="background-color: #eef2ff; border: 1px solid #c7d2fe; border-radius: 14px; padding: 14px; height: 100%;">
                              <p style="margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #4338ca; font-weight: 700;">Focus Industries</p>
                              <p style="margin: 6px 0 0; font-size: 13px; color: #1f2937; line-height: 1.6;" title="${industriesPreview.titleAttr}">${industriesPreview.previewHtml}</p>
                            </div>
                          </td>
                          <td style="width: 50%; padding-left: 12px;">
                            <div style="background-color: #ecfdf5; border: 1px solid #bbf7d0; border-radius: 14px; padding: 14px; height: 100%;">
                              <p style="margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #047857; font-weight: 700;">Geographic Coverage</p>
                              <p style="margin: 6px 0 0; font-size: 13px; color: #1f2937; line-height: 1.6;" title="${geographiesPreview.titleAttr}">${geographiesPreview.previewHtml}</p>
                            </div>
                          </td>
                        </tr>
                      </table>

                      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 16px; padding: 18px; margin-bottom: 18px;">
                        <p style="margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #047857; font-weight: 700;">Typical Client Revenue</p>
                        <p style="margin: 8px 0 0; font-size: 15px; color: #065f46; font-weight: 700;">${revenueRangeHtml}</p>
                      </div>
 */'' } 
                      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 16px; padding: 18px;">
                        <p style="margin: 0 0 10px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; font-weight: 700;">Contact Details</p>
                        <p style="margin: 0 0 6px; font-size: 13px; color: #1f2937;"><strong>${contactNameHtml}</strong></p>
                        <p style="margin: 0 0 6px; font-size: 13px; color: #1f2937;">${phoneRaw.length > 0 ? `<a href="${escapeAttr(`tel:${phoneRaw.replace(/[^+\d]/g, '')}`)}" style="color:#1f2937; text-decoration:none;">${phoneDisplay}</a>` : 'Phone not provided'}</p>
                        <p style="margin: 0 0 6px; font-size: 13px; color: #1f2937;">${emailRaw.length > 0 ? `<a href="${escapeAttr(`mailto:${emailRaw}`)}" style="color:#1f2937; text-decoration:none;">${emailDisplay}</a>` : 'Email not provided'}</p>
                        <p style="margin: 0; font-size: 13px; color: #1f2937;">${websiteRaw.length > 0 ? `<a href="${websiteHref}" style="color:#4f46e5; text-decoration:none;">${websiteDisplay}</a>` : 'Website not provided'}</p>
                      </div>
                      ${/* <div style="text-align: center; padding: 20px 0 4px;">
                        <a href="${sellerDashboardHref}" style="display: inline-block; padding: 12px 28px; border-radius: 999px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none;">View in Seller Dashboard</a>
                      </div> */''}
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
    const sellerContactNameRaw = seller.contactName?.trim();
    const sellerUserNameTrimmed = sellerUser?.name?.trim();
    const sellerDisplayNameForEmail =
      (sellerContactNameRaw && sellerContactNameRaw.length > 0
        ? sellerContactNameRaw
        : sellerUserNameTrimmed && sellerUserNameTrimmed.length > 0
          ? sellerUserNameTrimmed
          : 'there') || 'there';
    const sellerNameHtml = escapeHtml(sellerDisplayNameForEmail);
    const sellerDashboardLink = escapeAttr(SellerdashboardUrl);
    const advisorDashboardLink = escapeAttr(AdvisordashboardUrl);
    const listEmailHtml = this.applyTemplate(directListTemplate, {
      sellerName: sellerNameHtml,
      advisorCount: matches.length.toString(),
      pluralLabel: pluralLabel,
      SellerdashboardUrl: sellerDashboardLink,
      AdvisordashboardUrl: advisorDashboardLink,
      advisorList: advisorListHtml,
    });

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

      const advisorHtml = this.applyTemplate(directOutreachTemplate, {
        ...emailData.replacements,
        ...this.buildIntroductionContext('direct-list', emailData.contextData),
      });

      try {
        await this.emailService.sendEmail({
          to: advisorUser?.email,
          subject:
            'Advisor Chooser Match: The seller has opted to reach out directly.',
          html: advisorHtml,
        });

        const connection = await this.connectionModel.create({
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
        console.log('[ConnectionsService] Created DIRECT_LIST connection:', {
          connectionId: connection._id,
          sellerId: seller.userId._id.toString(),
          advisorId: (advisor._id as any).toString(),
          advisorUserId: advisorUser?._id?.toString(),
          type: ConnectionType.DIRECT_LIST,
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

