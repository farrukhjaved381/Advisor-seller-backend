import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Seller } from './schemas/seller.schema';
import { CreateSellerProfileDto } from './dto/create-seller-profile.dto';
import { UpdateSellerProfileDto } from './dto/update-seller-profile.dto';
import { UsersService } from '../users/users.service';
import { EmailService } from '../auth/email.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class SellersService {
  constructor(
    @InjectModel(Seller.name) private sellerModel: Model<Seller>,
    private usersService: UsersService,
    private emailService: EmailService,
  ) {
    console.log('SellersService initialized - Cron job for seller cleanup registered');
  }

  async createProfile(
    userId: string,
    createSellerProfileDto: CreateSellerProfileDto,
  ): Promise<Seller> {
    const existingProfile = await this.sellerModel.findOne({ userId });
    if (existingProfile) {
      throw new ConflictException('Seller profile already exists');
    }

    const seller = new this.sellerModel({
      userId,
      ...createSellerProfileDto,
    });

    const savedSeller = await seller.save();
    await this.usersService.updateProfileComplete(userId, true);

    const user = await this.usersService.findById(userId);
    if (user?.email) {
      const completeName = createSellerProfileDto.contactName || user.name || 'there';
      const escapeHtml = (value: string) =>
        value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      const escapeAttr = (value: string) => escapeHtml(value);
      const safeCompleteName = escapeHtml(completeName);
      const frontendUrl =
        process.env.FRONTEND_URL?.replace(/\/$/, '') ||
        'https://frontend-five-pied-17.vercel.app';
      const sellerDashboardUrl = `${frontendUrl}/seller-login`;
      const sellerDashboardHref = escapeAttr(sellerDashboardUrl);

      const emailBody = `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <title>Interview Playbook</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937;">
            <div style="padding: 32px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 720px; margin: 0 auto; border-collapse: separate; border-spacing: 0;">
                <tr>
                  <td style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 24px; overflow: hidden; box-shadow: 0 22px 60px rgba(15, 23, 42, 0.08);">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
                      <tr>
                        <td style="background: linear-gradient(135deg, #eef2ff 0%, #f0fdf4 100%); padding: 32px 36px;">
                          <p style="margin: 0; color: #6366f1; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;">Seller Playbook</p>
                          <h1 style="margin: 12px 0 6px; font-size: 24px; line-height: 1.3; font-weight: 700; color: #111827;">Prep for world-class advisor conversations</h1>
                          <p style="margin: 0; font-size: 14px; color: #4b5563; line-height: 1.6;">
                            Hi ${safeCompleteName}, thanks for using Advisor Chooser. We recommend interviewing at least five advisors before deciding who will lead your transaction.
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 28px 32px 26px;">
                          <p style="margin: 0 0 18px; font-size: 15px; line-height: 1.6;">Use the questions below to keep every conversation structured and productive.</p>

                          <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 18px; padding: 24px; margin-bottom: 24px;">
                            <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Five questions to ask every advisor</h2>
                            <ol style="margin: 0; padding-left: 18px; font-size: 14px; color: #1f2937; line-height: 1.8;">
                              <li><strong>&quot;What is your specific experience selling companies in our industry and size range?&quot;</strong><br />
                                <em>Why this matters:</em> Industry expertise is crucial because each sector has unique valuation metrics, buyer pools, regulatory considerations, and market dynamics. An advisor who has sold manufacturing companies may not understand the nuances of selling a SaaS business or healthcare services company. Similarly, selling a $5 million company requires different skills and networks than selling a $100 million enterprise. You want to see evidence of relevant transactions, understand their role in those deals, and confirm they have established relationships with buyers who would be interested in your type of business. Ask for specific examples and references from similar transactions.</li>
                              <li><strong>&quot;Can you walk me through your complete process from engagement to closing, including timeline and key milestones?&quot;</strong><br />
                                <em>Why this matters:</em> A structured, proven process indicates professionalism and helps you understand what to expect. The advisor should be able to articulate their approach to business valuation, marketing strategy, buyer identification and outreach, due diligence management, negotiation tactics, and closing coordination. Understanding the timeline helps you plan accordingly—quality M&amp;A processes typically take 6-12 months. Be wary of advisors who promise unrealistically quick sales or can't clearly explain their methodology. This question also reveals how much of your time will be required and when you'll need to involve your management team, legal counsel, and accountants.</li>
                              <li><strong>&quot;What is your fee structure, and how do you align your incentives with achieving the best outcome for us?&quot;</strong><br />
                                <em>Why this matters:</em> Fee structures vary significantly and directly impact your net proceeds. Most reputable M&amp;A advisors work on a success fee basis (typically 3-10% of transaction value, with rates declining as deal size increases), but some may also charge monthly retainers or upfront fees. Understand exactly what triggers fee payments, how fees are calculated, and what happens if the deal doesn't close. Ask about the advisor's policy on representing multiple parties and potential conflicts of interest. The best advisors align their compensation with your success—they should be motivated to maximize your sale price and terms, not just complete any transaction quickly.</li>
                              <li><strong>&quot;How will you value our business, and what comparable transactions or valuation methodologies will you use?&quot;</strong><br />
                                <em>Why this matters:</em> Valuation is both an art and science, and different advisors may arrive at significantly different value ranges for your business. A quality advisor should be able to explain multiple valuation approaches (comparable company analysis, precedent transactions, discounted cash flow analysis) and justify which methods are most appropriate for your situation. They should demonstrate knowledge of recent market multiples in your industry and explain how your company's unique characteristics (growth rate, profitability, market position, management team, etc.) might command premium or discount valuations. Be skeptical of advisors who give you an immediate valuation without thoroughly understanding your business or who seem to inflate values just to win your business.</li>
                              <li><strong>&quot;What is your current deal pipeline, and how will you ensure our transaction receives adequate attention and resources?&quot;</strong><br />
                                <em>Why this matters:</em> M&amp;A advisors often juggle multiple transactions simultaneously, and you want to ensure your deal won't get lost in the shuffle. Understanding their current workload helps you assess whether they have capacity to dedicate senior-level attention to your transaction. Ask about the specific team members who would work on your deal, their experience levels, and how much of the advisor's time you can expect. Some firms operate with junior staff doing much of the work while senior partners only appear for key meetings. You're likely making this decision once in your lifetime—you deserve an advisor who will treat your transaction as a priority and provide consistent, high-quality service throughout the process.</li>
                            </ol>
                          </div>

                          <div style="background-color: #ecfdf5; border: 1px solid #bbf7d0; border-radius: 18px; padding: 24px; margin-bottom: 24px;">
                            <h2 style="margin: 0 0 12px; font-size: 18px; color: #047857;">Be ready to answer these five questions</h2>
                            <ol style="margin: 0; padding-left: 18px; font-size: 14px; color: #065f46; line-height: 1.8;">
                              <li><strong>&quot;What are your primary motivations for selling, and what does a successful transaction look like to you?&quot;</strong><br />
                                <em>Why you need a clear answer:</em> M&amp;A advisors need to understand your true motivations to craft the right strategy and identify suitable buyers. Your priorities influence deal structure, buyer selection, and negotiation priorities. Be honest—advisors can't serve you well if they don't understand what success means to you personally and professionally.</li>
                              <li><strong>&quot;Walk me through your financial performance over the past three years and your projections for the next two years.&quot;</strong><br />
                                <em>Why you need solid preparation:</em> You should have clean, organized financials readily available and be able to explain key trends. Advisors are evaluating whether your business is marketable and at what valuation range. Disorganized financial information can derail a transaction or significantly reduce your value.</li>
                              <li><strong>&quot;What makes your business unique and defensible in the marketplace?&quot;</strong><br />
                                <em>Why this matters:</em> Advisors need to understand your competitive advantages to position your company effectively to buyers. Be ready to articulate your unique value proposition, competitive moats, customer relationships, proprietary processes, technology advantages, or market position.</li>
                              <li><strong>&quot;What are the key risks or challenges in your business that potential buyers should understand?&quot;</strong><br />
                                <em>Why honesty is crucial:</em> Every business has risks. Be upfront about potential concerns so advisors can help you address fixable issues before going to market and develop strategies for presenting unavoidable risks in context.</li>
                              <li><strong>&quot;What is your ideal timeline for completing a transaction, and what constraints or requirements do you have regarding the process?&quot;</strong><br />
                                <em>Why timing and constraints matter:</em> Understanding your availability, constraints, and timing expectations helps advisors structure a realistic process and manage expectations.</li>
                            </ol>
                          </div>

                          <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 18px; padding: 22px; margin-bottom: 20px;">
                            <p style="margin: 0 0 12px; font-size: 14px; color: #1f2937; line-height: 1.7;">Preparation tip: Spend time with your accountant and attorney to ensure your financial house is in order and you understand any legal or tax implications of a sale. The more organized and thoughtful you appear, the more confident advisors will be in your ability to successfully navigate a complex transaction. Remember, advisors are also evaluating whether they want to work with you—they prefer clients who are prepared, realistic, and committed to the process.</p>
                            <p style="margin: 0; font-size: 14px; color: #1f2937; line-height: 1.7;">This may seem like a lot, but the goal is to find the right steward for your company and to have a great exit. Finally, do not sell your company without the help of an advisor!</p>
                          </div>

                          <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">Questions? We're here at support@advisorchooser.com.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px auto 0; max-width: 720px; font-size: 12px; color: #9ca3af; text-align: center;">Advisor Chooser helps sellers find and evaluate world-class advisors with confidence.</p>
            </div>
          </body>
        </html>`;

      try {
        await this.emailService.sendEmail({
          to: user.email,
          subject: 'M&A Advisor Interview Questions',
          html: emailBody,
        });
      } catch (error) {
        console.error(
          'Failed to send seller interview questions email:',
          error,
        );
      }
    }

    return savedSeller;
  }

  async getProfileByUserId(userId: string): Promise<Seller | null> {
    return this.sellerModel.findOne({ userId });
  }

  async updateProfile(
    userId: string,
    updateSellerProfileDto: UpdateSellerProfileDto,
  ): Promise<Seller> {
    const seller = await this.sellerModel.findOneAndUpdate(
      { userId },
      updateSellerProfileDto,
      { new: true },
    );

    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    return seller;
  }

  async deleteProfile(userId: string): Promise<{ message: string }> {
    const result = await this.sellerModel.deleteOne({ userId });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Seller profile not found');
    }

    await this.usersService.deleteUser(userId);

    return { message: 'Seller profile and user deleted successfully' };
  }

  async toggleActiveStatus(userId: string, isActive: boolean): Promise<Seller> {
    const seller = await this.sellerModel.findOneAndUpdate(
      { userId },
      { isActive },
      { new: true },
    );

    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    return seller;
  }

  async findAll(): Promise<Seller[]> {
    return this.sellerModel.find().populate('userId', 'name email');
  }

  async findById(id: string): Promise<Seller | null> {
    return this.sellerModel.findById(id).populate('userId', 'name email');
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    console.log('Running daily cleanup of sellers created >24 hours ago');
    await this.deleteInactiveSellers();
  }

  async deleteInactiveSellers(): Promise<void> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    console.log('Checking for sellers created before:', twentyFourHoursAgo);
    
    const oldSellers = await this.sellerModel.find({
      createdAt: { $lt: twentyFourHoursAgo }
    });
    
    console.log(`Found ${oldSellers.length} sellers to delete`);

    for (const seller of oldSellers) {
      try {
        console.log(`Deleting seller ${seller._id} created at ${(seller as any).createdAt}`);
        
        // Delete seller profile directly
        await this.sellerModel.deleteOne({ _id: seller._id });
        
        // Delete associated user
        await this.usersService.deleteUser(seller.userId.toString());
        
        console.log(`Successfully deleted seller: ${seller._id}`);
      } catch (error) {
        console.error(`Failed to delete seller ${seller._id}:`, error);
      }
    }
  }
}
