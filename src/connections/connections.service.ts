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

    let emailsSent = 0;

    // Send introduction email to each selected advisor
    for (const advisor of selectedAdvisors) {
      const advisorUser = advisor.userId as any;

      // Replace template variables
      const emailHtml = template
        .replace(/{{advisorName}}/g, advisorUser.name)
        .replace(/{{sellerCompany}}/g, seller.companyName)
        .replace(/{{sellerIndustry}}/g, seller.industry)
        .replace(/{{sellerGeography}}/g, seller.geography)
        .replace(/{{sellerRevenue}}/g, seller.annualRevenue.toLocaleString())
        .replace(
          /{{sellerDescription}}/g,
          seller.description || 'No description provided',
        )
        .replace(/{{sellerName}}/g, sellerUser.name)
        .replace(/{{sellerEmail}}/g, sellerUser.email)
        .replace(/{{advisorIndustries}}/g, advisor.industries.join(', '))
        .replace(/{{advisorGeographies}}/g, advisor.geographies.join(', '));

      try {
        await this.emailService.sendEmail({
          to: advisorUser.email,
          cc: sellerUser.email,
          subject: `New Client Introduction - ${seller.companyName}`,
          html: emailHtml,
        });

        // Record the connection
        await this.connectionModel.create({
          sellerId: seller.userId._id,
          advisorId: advisor._id,
          type: ConnectionType.INTRODUCTION,
        });
        emailsSent++;
      } catch (error) {
        console.error(`Failed to send email to ${advisorUser.email}:`, error);
      }
    }

    return {
      message: `Introduction emails sent to ${emailsSent} advisors`,
      emailsSent,
    };
  }

  // Sends direct contact list to seller and notifies all matched advisors
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
    const notificationTemplate = fs.readFileSync(
      path.join(process.cwd(), 'templates', 'match-notification.hbs'),
      'utf8',
    );

    // Prepare advisor data for email
    const advisorData = advisors.map((advisor) => {
      const advisorUser = advisor.userId as any;
      return {
        companyName: advisor.companyName,
        email: advisorUser.email,
        industries: advisor.industries.join(', '),
        geographies: advisor.geographies.join(', '),
        yearsExperience: advisor.yearsExperience,
        licensing: advisor.licensing || 'Not specified',
      };
    });

    // Build advisor list HTML
    const advisorListHtml = advisorData
      .map(
        (advisor) =>
          `<div style="border-bottom: 1px solid #dee2e6; padding: 15px 0;">
        <h4 style="margin: 0 0 10px 0; color: #007bff;">${advisor.companyName}</h4>
        <p style="margin: 5px 0;"><strong>Contact:</strong> ${advisor.email}</p>
        <p style="margin: 5px 0;"><strong>Industries:</strong> ${advisor.industries}</p>
        <p style="margin: 5px 0;"><strong>Geographies:</strong> ${advisor.geographies}</p>
        <p style="margin: 5px 0;"><strong>Experience:</strong> ${advisor.yearsExperience} years</p>
        ${advisor.licensing !== 'Not specified' ? `<p style="margin: 5px 0;"><strong>Licensing:</strong> ${advisor.licensing}</p>` : ''}
      </div>`,
      )
      .join('');

    // Send contact list to seller - simple template replacement
    let listEmailHtml = directListTemplate
      .replace(/{{sellerName}}/g, sellerUser.name)
      .replace(/{{advisorCount}}/g, matches.length.toString());

    // Replace the advisor loop section
    const loopStart = listEmailHtml.indexOf('{{#each advisors}}');
    const loopEnd = listEmailHtml.indexOf('{{/each}}') + 9;
    if (loopStart !== -1 && loopEnd !== -1) {
      listEmailHtml =
        listEmailHtml.substring(0, loopStart) +
        advisorListHtml +
        listEmailHtml.substring(loopEnd);
    }

    try {
      await this.emailService.sendEmail({
        to: sellerUser.email,
        subject: `Your Matched Advisors Contact List - ${matches.length} Matches Found`,
        html: listEmailHtml,
      });
    } catch (error) {
      console.error('Failed to send contact list to seller:', error);
    }

    // Send notifications to all matched advisors
    let notificationsSent = 0;
    for (const advisor of advisors) {
      const advisorUser = advisor.userId as any;

      const notificationHtml = notificationTemplate
        .replace(/{{advisorName}}/g, advisorUser.name)
        .replace(/{{sellerCompany}}/g, seller.companyName)
        .replace(/{{sellerIndustry}}/g, seller.industry)
        .replace(/{{sellerGeography}}/g, seller.geography)
        .replace(/{{sellerRevenue}}/g, seller.annualRevenue.toLocaleString());

      try {
        await this.emailService.sendEmail({
          to: advisorUser.email,
          subject: `A Seller Was Matched To You But Will Reach Out On Their Own`,
          html: notificationHtml,
        });

        // Record the connection
        await this.connectionModel.create({
          sellerId: seller.userId._id,
          advisorId: advisor._id,
          type: ConnectionType.DIRECT_LIST,
        });
        notificationsSent++;
      } catch (error) {
        console.error(
          `Failed to send notification to ${advisorUser.email}:`,
          error,
        );
      }
    }

    return {
      message: `Contact list sent to seller, ${notificationsSent} advisors notified`,
      advisorCount: matches.length,
    };
  }
}
