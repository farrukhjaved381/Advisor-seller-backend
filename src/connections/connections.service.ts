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

type IntroductionContextType =
  | 'advisor-introduction'
  | 'seller-copy'
  | 'direct-list';

interface IntroductionEmailContextData {
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
}

interface IntroductionEmailData {
  replacements: Record<string, string>;
  contextData: IntroductionEmailContextData;
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
}

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
    contextType: IntroductionContextType,
    emailData: IntroductionEmailData,
  ): Record<string, string> {
    const { replacements, contextData } = emailData;

    const buildLink = (href: string, label: string): string => {
      if (!href || href === '#') {
        return label;
      }
      return `<a href="${href}" style="color:#4f46e5; text-decoration:none;">${label}</a>`;
    };

    if (contextType === 'advisor-introduction') {
      const heroTitle = `${contextData.sellerCompanyText} wants to connect`;
      const heroSubtitle =
        'We matched you with this seller because your experience aligns with what they need.';
      const contactSection = this.buildContactSection({
        phoneValue: replacements.sellerPhone,
        phoneHref: replacements.sellerTelHref,
        phoneCtaLabel: `Call ${contextData.sellerCompanyText}`,
        emailValue: contextData.sellerEmailText,
        emailHref: replacements.sellerEmailHref,
        emailCtaLabel: `Email ${contextData.sellerCompanyText}`,
        websiteValue: replacements.sellerWebsiteText,
        websiteHref: replacements.sellerWebsiteHref,
      });
      const sellerDetailsSection = this.buildSellerDetailsSection({
        companyName: contextData.sellerCompanyText,
        industry: contextData.sellerIndustryText,
        geography: contextData.sellerGeographyText,
        description: replacements.sellerDescription,
        revenueDisplay: replacements.sellerRevenue,
        contactName: contextData.sellerNameText,
        contactEmail: contextData.sellerEmailText,
      });
      const sellerEmailLink = buildLink(
        replacements.sellerEmailHref,
        contextData.sellerEmailText,
      );
      const advisorDashboardLink = buildLink(
        contextData.advisordashboardHref,
        'advisor dashboard',
      );
      const nextStepsSection = this.buildNextStepsSection(
        'Suggested next steps',
        [
          `Reach out to ${contextData.sellerNameText} at ${sellerEmailLink} to schedule your discovery call.`,
          `Review the ${contextData.sellerCompanyText} snapshot below before your conversation.`,
          `Log updates from the relationship in your ${advisorDashboardLink}.`,
        ],
      );

      return {
        introGreeting: `Hi ${contextData.advisorDisplayNameText},`,
        introMessage: `We've introduced you to <strong>${contextData.sellerCompanyText}</strong>. ${contextData.sellerNameText} will reach out soon, and you can use the contact details below to connect directly.`,
        primaryCtaLabel: this.escapeHtml('Open Advisor Dashboard'),
        primaryCtaUrl: contextData.advisordashboardHref,
        footerNote: `You're receiving this introduction because ${contextData.sellerCompanyText} selected you on Advisor Chooser.`,
        heroTitle,
        heroSubtitle,
        contactSection,
        advisorDetailsSection: '',
        sellerDetailsSection,
        nextStepsSection,
      };
    }

    if (contextType === 'seller-copy') {
      const heroTitle = `Introduction sent to ${contextData.advisorCompanyNameText}`;
      const heroSubtitle =
        'We just shared your opportunity and highlighted why this advisor is a strong fit.';
      const contactSection = this.buildContactSection({
        phoneValue: replacements.advisorPhone,
        phoneHref: replacements.advisorTelHref,
        phoneCtaLabel: `Call ${contextData.advisorCompanyNameText}`,
        emailValue: replacements.advisorEmail,
        emailHref: replacements.advisorEmailHref,
        emailCtaLabel: `Email ${contextData.advisorCompanyNameText}`,
        websiteValue: replacements.advisorWebsiteText,
        websiteHref: replacements.advisorWebsiteHref,
      });
      const advisorDetailsSection = this.buildAdvisorDetailsSection({
        industriesHtml: replacements.advisorIndustries,
        industriesTitle: replacements.advisorIndustriesTitle,
        geographiesHtml: replacements.advisorGeographies,
        geographiesTitle: replacements.advisorGeographiesTitle,
        focusAreasCta: contextData.focusAreasCtaSeller,
        revenueRangeText: replacements.advisorRevenueRange,
        descriptionText: replacements.advisorDescription,
      });
      const advisorEmailLink = buildLink(
        replacements.advisorEmailHref,
        replacements.advisorEmail,
      );
      const sellerDashboardLink = buildLink(
        contextData.sellerdashboardHref,
        'seller dashboard',
      );
      const nextStepsSection = this.buildNextStepsSection('Keep momentum', [
        `Follow up with ${replacements.advisorName} at ${advisorEmailLink} to lock in a meeting.`,
        `Share any materials ${contextData.advisorCompanyNameText} needs to evaluate the opportunity.`,
        `Track progress and notes in your ${sellerDashboardLink}.`,
      ]);

      return {
        introGreeting: `Hi ${contextData.sellerNameText},`,
        introMessage: `Here's the warm introduction we just shared with <strong>${contextData.advisorCompanyNameText}</strong>. Reply-all or reach out directly using the advisor's details below to keep the conversation moving.`,
        primaryCtaLabel: this.escapeHtml('Open Seller Dashboard'),
        primaryCtaUrl: contextData.sellerdashboardHref,
        footerNote: `You're receiving this because you asked us to introduce you to ${contextData.advisorCompanyNameText}.`,
        heroTitle,
        heroSubtitle,
        contactSection,
        advisorDetailsSection,
        sellerDetailsSection: '',
        nextStepsSection,
      };
    }

    const heroTitle = `Direct match: ${contextData.sellerCompanyText}`;
    const heroSubtitle =
      'They opted to reach out directly after reviewing your profile.';
    const contactSection = this.buildContactSection({
      phoneValue: replacements.sellerPhone,
      phoneHref: replacements.sellerTelHref,
      phoneCtaLabel: `Call ${contextData.sellerCompanyText}`,
      emailValue: contextData.sellerEmailText,
      emailHref: replacements.sellerEmailHref,
      emailCtaLabel: `Email ${contextData.sellerCompanyText}`,
      websiteValue: replacements.sellerWebsiteText,
      websiteHref: replacements.sellerWebsiteHref,
    });
    const sellerDetailsSection = this.buildSellerDetailsSection({
      companyName: contextData.sellerCompanyText,
      industry: contextData.sellerIndustryText,
      geography: contextData.sellerGeographyText,
      description: replacements.sellerDescription,
      revenueDisplay: replacements.sellerRevenue,
      contactName: contextData.sellerNameText,
      contactEmail: contextData.sellerEmailText,
    });
    const sellerEmailLink = buildLink(
      replacements.sellerEmailHref,
      contextData.sellerEmailText,
    );
    const advisorDashboardLink = buildLink(
      contextData.advisordashboardHref,
      'advisor dashboard',
    );
    const nextStepsSection = this.buildNextStepsSection('What happens next', [
      `Expect an introduction email from ${contextData.sellerNameText} at ${sellerEmailLink}.`,
      `If you haven't heard within a few days, feel free to reach out using the contact details above.`,
      `Log the outcome in your ${advisorDashboardLink}.`,
    ]);

    return {
      introGreeting: `Hi ${contextData.advisorDisplayNameText},`,
      introMessage: `We matched you with <strong>${contextData.sellerCompanyText}</strong>. They opted to reach out directly, so expect to hear from ${contextData.sellerNameText} soon. You can also reach them at ${contextData.sellerEmailText}.`,
      primaryCtaLabel: this.escapeHtml('Open Advisor Dashboard'),
      primaryCtaUrl: contextData.advisordashboardHref,
      footerNote: `You're receiving this notification because ${contextData.sellerCompanyText} selected you on Advisor Chooser and chose to handle outreach directly.`,
      heroTitle,
      heroSubtitle,
      contactSection,
      advisorDetailsSection: '',
      sellerDetailsSection,
      nextStepsSection,
    };
  }

  private buildContactSection(params: {
    phoneValue: string;
    phoneHref: string;
    phoneCtaLabel: string;
    emailValue: string;
    emailHref: string;
    emailCtaLabel: string;
    websiteValue: string;
    websiteHref: string;
  }): string {
    return `
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-bottom: 24px;">
                    <tr>
                      <td style="width: 33.33%; padding: 10px;">
                        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; height: 100%;">
                          <p style="margin: 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #9ca3af; font-weight: 600;">Phone</p>
                          <p style="margin: 6px 0 0; font-size: 14px; color: #111827; font-weight: 600;">${params.phoneValue}</p>
                          <p style="margin: 6px 0 0; font-size: 12px;">
                            <a href="${params.phoneHref}" style="color: #6366f1; text-decoration: none;">${params.phoneCtaLabel}</a>
                          </p>
                        </div>
                      </td>
                      <td style="width: 33.33%; padding: 10px;">
                        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; height: 100%;">
                          <p style="margin: 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #9ca3af; font-weight: 600;">Email</p>
                          <p style="margin: 6px 0 0; font-size: 14px; color: #111827; font-weight: 600; word-break: break-all;">${params.emailValue}</p>
                          <p style="margin: 6px 0 0; font-size: 12px;">
                            <a href="${params.emailHref}" style="color: #6366f1; text-decoration: none;">${params.emailCtaLabel}</a>
                          </p>
                        </div>
                      </td>
                      <td style="width: 33.33%; padding: 10px;">
                        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; height: 100%;">
                          <p style="margin: 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #9ca3af; font-weight: 600;">Website</p>
                          <p style="margin: 6px 0 0; font-size: 14px; font-weight: 600; word-break: break-all;">
                            <a href="${params.websiteHref}" target="_blank" rel="noopener noreferrer" style="color: #4f46e5; text-decoration: none;">${params.websiteValue}</a>
                          </p>
                        </div>
                      </td>
                    </tr>
                  </table>
    `;
  }

  private buildAdvisorDetailsSection(params: {
    industriesHtml: string;
    industriesTitle: string;
    geographiesHtml: string;
    geographiesTitle: string;
    focusAreasCta?: string;
    revenueRangeText: string;
    descriptionText: string;
  }): string {
    const focusAreasCta = params.focusAreasCta ?? '';
    return `
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-bottom: 12px;">
                    <tr>
                      <td style="width: 50%; padding: 10px;">
                        <div style="background-color: #eef2ff; border: 1px solid #c7d2fe; border-radius: 14px; padding: 14px; height: 100%;">
                          <p style="margin: 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #4338ca; font-weight: 700;">Focus Industries</p>
                          <p style="margin: 6px 0 0; font-size: 14px; color: #1f2937; line-height: 1.5;" title="${params.industriesTitle}">${params.industriesHtml}</p>
                        </div>
                      </td>
                      <td style="width: 50%; padding: 10px;">
                        <div style="background-color: #ecfdf5; border: 1px solid #bbf7d0; border-radius: 14px; padding: 14px; height: 100%;">
                          <p style="margin: 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #047857; font-weight: 700;">Geographic Coverage</p>
                          <p style="margin: 6px 0 0; font-size: 14px; color: #1f2937; line-height: 1.5;" title="${params.geographiesTitle}">${params.geographiesHtml}</p>
                        </div>
                      </td>
                    </tr>
                  </table>

                  ${focusAreasCta}

                  <div style="background-color: #ecfdf5; border: 1px solid #bbf7d0; border-radius: 16px; padding: 20px; margin: 20px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
                      <tr>
                        <td style="vertical-align: top;">
                          <p style="margin: 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #047857; font-weight: 700;">Typical Client Revenue</p>
                          <p style="margin: 8px 0 0; font-size: 18px; color: #065f46; font-weight: 700;">${params.revenueRangeText}</p>
                        </td>
                        <td style="text-align: right; vertical-align: middle;">
                          <span style="display: inline-block; padding: 8px 14px; border-radius: 999px; background-color: #d1fae5; color: #047857; font-size: 12px; font-weight: 700;">Strong Alignment</span>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 16px; padding: 20px; margin-bottom: 24px;">
                    <p style="margin: 0 0 10px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6366f1; font-weight: 700;">At a Glance</p>
                    <h2 style="margin: 0 0 12px; font-size: 20px; color: #111827;">About this advisor</h2>
                    <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #1f2937;">${params.descriptionText}</p>
                  </div>
    `;
  }

  private buildSellerDetailsSection(params: {
    companyName: string;
    industry: string;
    geography: string;
    description: string;
    revenueDisplay: string;
    contactName: string;
    contactEmail: string;
  }): string {
    return `
                  <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 22px; margin-bottom: 24px; box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.05);">
                    <p style="margin: 0 0 12px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6366f1; font-weight: 700;">Seller Snapshot</p>
                    <h3 style="margin: 0; font-size: 18px; color: #111827;">${params.companyName}</h3>
                    <p style="margin: 6px 0 12px; font-size: 14px; color: #4b5563;">Industry: ${params.industry} · Location: ${params.geography}</p>
                    <p style="margin: 0 0 12px; font-size: 14px; color: #1f2937; line-height: 1.6;">${params.description}</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-top: 8px;">
                      <tr>
                        <td style="width: 50%; padding: 8px 0; font-size: 13px; color: #4b5563;">Estimated annual revenue</td>
                        <td style="width: 50%; padding: 8px 0; font-size: 13px; color: #111827; font-weight: 600; text-align: right;">$${params.revenueDisplay}</td>
                      </tr>
                      <tr>
                        <td style="width: 50%; padding: 8px 0; font-size: 13px; color: #4b5563;">Primary contact</td>
                        <td style="width: 50%; padding: 8px 0; font-size: 13px; color: #111827; font-weight: 600; text-align: right;">${params.contactName} · ${params.contactEmail}</td>
                      </tr>
                    </table>
                  </div>
    `;
  }

  private buildNextStepsSection(title: string, steps: string[]): string {
    const stepsHtml = steps.map((step) => `<li>${step}</li>`).join('');

    return `
                  <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 18px; padding: 22px; margin-bottom: 24px;">
                    <h4 style="margin: 0 0 12px; font-size: 16px; color: #111827;">${title}</h4>
                    <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #4b5563; line-height: 1.7;">
                      ${stepsHtml}
                    </ol>
                  </div>
    `;
  }

  private buildIntroductionEmailData(params: {
    advisor: AdvisorDocument;
    advisorUser: any;
    seller: SellerDocument;
    sellerUser: User;
    sellerDashboardUrl: string;
    advisorDashboardUrl: string;
  }): IntroductionEmailData {
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

    const sellerContactNameValue =
      this.sanitizeSnapshotString(seller.contactName) || sellerUser.name;
    const sellerContactEmailValue =
      this.sanitizeSnapshotString(seller.contactEmail) ||
      this.sanitizeSnapshotString(sellerUser.email);
    const sellerPhoneValue = this.sanitizeSnapshotString(seller.phone);
    const sellerWebsiteValue = this.sanitizeSnapshotString(seller.website);

    const sellerContactEmailRaw = sellerContactEmailValue || '';
    const sellerContactEmailText = this.escapeHtml(
      sellerContactEmailRaw.length > 0 ? sellerContactEmailRaw : 'Not provided',
    );
    const sellerEmailHref =
      sellerContactEmailRaw.length > 0
        ? this.escapeAttr(`mailto:${sellerContactEmailRaw}`)
        : '#';

    const sellerContactNameText = this.escapeHtml(sellerContactNameValue);
    const sellerPhoneRaw = sellerPhoneValue || '';
    const sellerPhoneText = this.escapeHtml(
      sellerPhoneRaw.length > 0 ? sellerPhoneRaw : 'Not provided',
    );
    const sellerTelHref =
      sellerPhoneRaw.length > 0
        ? this.escapeAttr(`tel:${sellerPhoneRaw.replace(/[^+\d]/g, '')}`)
        : '#';

    const sellerWebsiteRaw = sellerWebsiteValue || '';
    const sellerWebsiteText =
      sellerWebsiteRaw.length > 0
        ? this.escapeHtml(sellerWebsiteRaw)
        : 'Website not provided';
    const sellerWebsiteHref =
      sellerWebsiteRaw.length > 0
        ? this.escapeAttr(
            sellerWebsiteRaw.startsWith('http')
              ? sellerWebsiteRaw
              : `https://${sellerWebsiteRaw}`,
          )
        : '#';

    const sellerNameText = sellerContactNameText;
    const sellerEmailText = sellerContactEmailText;

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
      sellerContactName: sellerContactNameText,
      sellerPhone: sellerPhoneText,
      sellerTelHref,
      sellerEmailHref,
      sellerWebsiteText,
      sellerWebsiteHref,
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
        ...this.buildIntroductionContext('advisor-introduction', emailData),
      });

      const sellerCopyHtml = this.applyTemplate(template, {
        ...emailData.replacements,
        ...this.buildIntroductionContext('seller-copy', emailData),
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
        ...this.buildIntroductionContext('direct-list', emailData),
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
