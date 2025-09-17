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

@Injectable()
export class SellersService {
  constructor(
    @InjectModel(Seller.name) private sellerModel: Model<Seller>,
    private usersService: UsersService,
    private emailService: EmailService,
  ) {}

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
      const firstName = (user.name || '').trim().split(/\s+/)[0] || 'there';
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2933;">
          <p style="font-size: 16px;">Hi ${firstName},</p>
          <p style="font-size: 16px; line-height: 1.6;">Thank you for using Advisor Chooser!</p>
          <p style="font-size: 16px; line-height: 1.6;">We strongly suggest that you interview at least 5 Advisors before choosing the right one for you.</p>

          <p style="font-size: 16px; line-height: 1.6;">Here are five critical questions a company seller should ask when evaluating M&A advisors, along with detailed explanations for why each matters:</p>
          <ol style="padding-left: 18px; font-size: 16px; line-height: 1.7;">
            <li><strong>"What is your specific experience selling companies in our industry and size range?"</strong><br/>
              <em>Why this matters:</em> Industry expertise is crucial because each sector has unique valuation metrics, buyer pools, regulatory considerations, and market dynamics. An advisor who has sold manufacturing companies may not understand the nuances of selling a SaaS business or healthcare services company. Similarly, selling a $5 million company requires different skills and networks than selling a $100 million enterprise. You want to see evidence of relevant transactions, understand their role in those deals, and confirm they have established relationships with buyers who would be interested in your type of business. Ask for specific examples and references from similar transactions.</li>
            <li><strong>"Can you walk me through your complete process from engagement to closing, including timeline and key milestones?"</strong><br/>
              <em>Why this matters:</em> A structured, proven process indicates professionalism and helps you understand what to expect. The advisor should be able to articulate their approach to business valuation, marketing strategy, buyer identification and outreach, due diligence management, negotiation tactics, and closing coordination. Understanding the timeline helps you plan accordingly—quality M&A processes typically take 6-12 months. Be wary of advisors who promise unrealistically quick sales or can't clearly explain their methodology. This question also reveals how much of your time will be required and when you'll need to involve your management team, legal counsel, and accountants.</li>
            <li><strong>"What is your fee structure, and how do you align your incentives with achieving the best outcome for us?"</strong><br/>
              <em>Why this matters:</em> Fee structures vary significantly and directly impact your net proceeds. Most reputable M&A advisors work on a success fee basis (typically 3-10% of transaction value, with rates declining as deal size increases), but some may also charge monthly retainers or upfront fees. Understand exactly what triggers fee payments, how fees are calculated, and what happens if the deal doesn't close. Ask about the advisor's policy on representing multiple parties and potential conflicts of interest. The best advisors align their compensation with your success—they should be motivated to maximize your sale price and terms, not just complete any transaction quickly.</li>
            <li><strong>"How will you value our business, and what comparable transactions or valuation methodologies will you use?"</strong><br/>
              <em>Why this matters:</em> Valuation is both an art and science, and different advisors may arrive at significantly different value ranges for your business. A quality advisor should be able to explain multiple valuation approaches (comparable company analysis, precedent transactions, discounted cash flow analysis) and justify which methods are most appropriate for your situation. They should demonstrate knowledge of recent market multiples in your industry and explain how your company's unique characteristics (growth rate, profitability, market position, management team, etc.) might command premium or discount valuations. Be skeptical of advisors who give you an immediate valuation without thoroughly understanding your business or who seem to inflate values just to win your business.</li>
            <li><strong>"What is your current deal pipeline, and how will you ensure our transaction receives adequate attention and resources?"</strong><br/>
              <em>Why this matters:</em> M&A advisors often juggle multiple transactions simultaneously, and you want to ensure your deal won't get lost in the shuffle. Understanding their current workload helps you assess whether they have capacity to dedicate senior-level attention to your transaction. Ask about the specific team members who would work on your deal, their experience levels, and how much of the advisor's time you can expect. Some firms operate with junior staff doing much of the work while senior partners only appear for key meetings. You're likely making this decision once in your lifetime—you deserve an advisor who will treat your transaction as a priority and provide consistent, high-quality service throughout the process.</li>
          </ol>

          <p style="font-size: 16px; line-height: 1.6;">Now, here are five critical questions sellers should be prepared to answer when interviewing M&A advisors, along with why being ready with thoughtful responses is essential:</p>
          <ol style="padding-left: 18px; font-size: 16px; line-height: 1.7;" start="1">
            <li><strong>"What are your primary motivations for selling, and what does a successful transaction look like to you?"</strong><br/>
              <em>Why you need a clear answer:</em> M&A advisors need to understand your true motivations to craft the right strategy and identify suitable buyers. Your priorities influence deal structure, buyer selection, and negotiation priorities. Be honest—advisors can't serve you well if they don't understand what success means to you personally and professionally.</li>
            <li><strong>"Walk me through your financial performance over the past three years and your projections for the next two years."</strong><br/>
              <em>Why you need solid preparation:</em> You should have clean, organized financials readily available and be able to explain key trends. Advisors are evaluating whether your business is marketable and at what valuation range. Disorganized financial information can derail a transaction or significantly reduce your value.</li>
            <li><strong>"What makes your business unique and defensible in the marketplace?"</strong><br/>
              <em>Why this matters:</em> Advisors need to understand your competitive advantages to position your company effectively to buyers. Be ready to articulate your unique value proposition, competitive moats, customer relationships, proprietary processes, technology advantages, or market position.</li>
            <li><strong>"What are the key risks or challenges in your business that potential buyers should understand?"</strong><br/>
              <em>Why honesty is crucial:</em> Every business has risks. Be upfront about potential concerns so advisors can help you address fixable issues before going to market and develop strategies for presenting unavoidable risks in context.</li>
            <li><strong>"What is your ideal timeline for completing a transaction, and what constraints or requirements do you have regarding the process?"</strong><br/>
              <em>Why timing and constraints matter:</em> Understanding your availability, constraints, and timing expectations helps advisors structure a realistic process and manage expectations.</li>
          </ol>

          <p style="font-size: 16px; line-height: 1.6;">Preparation tip: Spend time with your accountant and attorney to ensure your financial house is in order and you understand any legal or tax implications of a sale. The more organized and thoughtful you appear, the more confident advisors will be in your ability to successfully navigate a complex transaction. Remember, advisors are also evaluating whether they want to work with you—they prefer clients who are prepared, realistic, and committed to the process.</p>

          <p style="font-size: 16px; line-height: 1.6;">This may seem like a lot, but the goal is to find the right steward for your company and to have a great exit. Finally, do not sell your company without the help of an advisor!</p>

          <p style="font-size: 16px; line-height: 1.6;">Best,<br/>The Advisor Chooser Team</p>
        </div>
      `;

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

    await this.usersService.updateProfileComplete(userId, false);

    return { message: 'Seller profile deleted successfully' };
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
}
