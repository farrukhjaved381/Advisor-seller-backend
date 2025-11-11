import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  Header,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AdvisorsService } from './advisors.service';
import { CreateAdvisorProfileDto } from './dto/create-advisor-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SubscriptionGuard } from '../auth/guards/subscription.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { memoryStorage } from 'multer';

@ApiTags('Advisors')
@Controller('advisors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADVISOR)
@ApiBearerAuth()
export class AdvisorsController {
  constructor(private advisorsService: AdvisorsService) {}

  @Post('profile')
  @ApiOperation({ summary: 'Create or update advisor profile' })
  @ApiResponse({ status: 201, description: 'Profile created/updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not an advisor' })
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'logo', maxCount: 1 },
    { name: 'testimonials', maxCount: 5 },
    { name: 'introVideo', maxCount: 1 },
  ]))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        companyName: { type: 'string' },
        phone: { type: 'string' },
        website: { type: 'string' },
        industries: { type: 'array', items: { type: 'string' } },
        geographies: { type: 'array', items: { type: 'string' } },
        yearsExperience: { type: 'number' },
        numberOfTransactions: { type: 'number' },
        currency: { type: 'string' },
        description: { type: 'string' },
        revenueRange: {
          type: 'object',
          properties: {
            min: { type: 'number' },
            max: { type: 'number' },
          },
        },
        logo: { type: 'string', format: 'binary' },
        introVideo: { type: 'string', format: 'binary' },
        testimonials: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
        sendLeads: { type: 'boolean' },
        workedWithCimamplify: { type: 'boolean' },
      },
    },
  })
  async createOrUpdateProfile(
    @Request() req,
    @Body() formData: any,
    @UploadedFiles() files: {
      logo?: Express.Multer.File[];
      testimonials?: Express.Multer.File[];
      introVideo?: Express.Multer.File[];
    },
  ) {
    try {
      // Parse any stringified JSON fields
      let profileData = { ...formData };
      
      // Handle JSON string fields
      if (typeof formData.revenueRange === 'string') {
        try {
          profileData.revenueRange = JSON.parse(formData.revenueRange);
        } catch (e) {
          throw new BadRequestException('Invalid revenueRange format');
        }
      }
      
      if (typeof formData.industries === 'string') {
        try {
          profileData.industries = JSON.parse(formData.industries);
        } catch (e) {
          throw new BadRequestException('Invalid industries format');
        }
      }
      
      if (typeof formData.geographies === 'string') {
        try {
          profileData.geographies = JSON.parse(formData.geographies);
        } catch (e) {
          throw new BadRequestException('Invalid geographies format');
        }
      }

      // Convert string booleans to actual booleans
      if (typeof profileData.sendLeads === 'string') {
        profileData.sendLeads = profileData.sendLeads === 'true';
      }
      
      if (typeof profileData.workedWithCimamplify === 'string') {
        profileData.workedWithCimamplify = profileData.workedWithCimamplify === 'true';
      }

      // First check if profile exists
      const existingProfile = await this.advisorsService.getProfileByUserId(req.user._id);
      
      if (existingProfile) {
        // Update existing profile with files
        return this.advisorsService.updateFullProfile(
          req.user._id,
          profileData,
          files
        );
      } else {
        // Create new profile with files
        return this.advisorsService.createProfile(req.user._id, profileData);
      }
    } catch (error) {
      console.error('Error in createOrUpdateProfile:', error);
      throw new BadRequestException(error.message || 'Failed to process profile');
    }
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get advisor profile' })
  @ApiResponse({ status: 200, description: 'Returns the advisor profile' })
  @ApiResponse({ status: 201, description: 'New empty profile created' })
  async getProfile(@Request() req) {
    const userId = req.user._id;
    let profile = await this.advisorsService.getProfileByUserId(userId);
    
    // If no profile exists, create an empty one
    if (!profile) {
      profile = await this.advisorsService.createEmptyProfile(userId, true);
      // Type assertion to access Mongoose document methods
      const profileObj = (profile as any).toObject ? (profile as any).toObject() : profile;
      return {
        ...profileObj,
        isNewProfile: true,  // Flag to indicate this is a new profile
        redirectTo: '/advisor-form'  // Tell frontend to redirect to form
      };
    }
    
    // If profile exists, convert to plain object if it's a Mongoose document
    return (profile as any).toObject ? (profile as any).toObject() : profile;
  }

  @Post('init-profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initialize advisor profile after payment' })
  @ApiResponse({ status: 201, description: 'Advisor profile initialized' })
  @ApiResponse({ status: 400, description: 'Profile already exists' })
  async initProfile(@Request() req) {
    const userId = req.user._id;
    
    // Check if profile already exists
    const existingProfile = await this.advisorsService.getProfileByUserId(userId);
    if (existingProfile) {
      throw new BadRequestException('Advisor profile already exists');
    }
    
    // Create empty profile and type it as any to access _id
    const profile = (await this.advisorsService.createEmptyProfile(userId, true)) as any;
    
    return {
      message: 'Advisor profile initialized successfully',
      profileId: profile._id || profile.id,
      redirectTo: '/advisor-form' // Frontend should redirect to the form
    };
  }

  /**
   * Updated PATCH endpoint:
   * Accepts multipart/form-data for text fields + logo + testimonials
   */
  @Patch('profile')
  @ApiOperation({
    summary: 'Update advisor profile (including logo & testimonials)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'logo', maxCount: 1 },
        { name: 'testimonials', maxCount: 5 },
        { name: 'introVideo', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 200 * 1024 * 1024 },
      },
    ),
  )
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        companyName: { type: 'string' },
        phone: { type: 'string' },
        website: { type: 'string' },
        industries: { type: 'array', items: { type: 'string' } },
        geographies: { type: 'array', items: { type: 'string' } },
        yearsExperience: { type: 'number' },
        numberOfTransactions: { type: 'number' },
        currency: { type: 'string' },
        description: { type: 'string' },
        revenueRange: {
          type: 'object',
          properties: {
            min: { type: 'number' },
            max: { type: 'number' },
          },
        },
        logo: { type: 'string', format: 'binary' },
        introVideo: { type: 'string', format: 'binary' },
        testimonials: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  async updateProfile(
    @Request() req,
    @Body() updateProfileDto: any,
    @UploadedFiles()
    files: {
      logo?: Express.Multer.File[];
      testimonials?: Express.Multer.File[];
      introVideo?: Express.Multer.File[];
    },
  ) {
    if (!updateProfileDto && !files) {
      throw new BadRequestException('No data or files provided for update');
    }
    return this.advisorsService.updateFullProfile(
      req.user._id,
      updateProfileDto,
      files,
    );
  }

  @Patch('profile/pause-leads')
  @ApiOperation({ summary: 'Toggle lead sending status' })
  @ApiResponse({ status: 200, description: 'Lead status updated successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { sendLeads: { type: 'boolean' } },
      required: ['sendLeads'],
    },
  })
  async toggleLeads(@Request() req, @Body() body: { sendLeads: boolean }) {
    return this.advisorsService.toggleLeadSending(req.user._id, body.sendLeads);
  }

  @Get('leads')
  @UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
  @ApiOperation({ summary: 'Get leads for the current advisor' })
  @ApiResponse({ status: 200, description: 'Leads retrieved successfully' })
  @ApiResponse({ status: 404, description: 'No leads found' })
  @Header(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  )
  async getLeads(@Request() req) {
    try {
      const userId = req.user._doc?._id || req.user._id || req.user.sub || req.user.id;
      console.log(
        '[AdvisorsController] /advisors/leads requested by user',
        userId?.toString(),
        'at',
        new Date().toISOString(),
      );
    } catch {}
    const userId = req.user._doc?._id || req.user._id || req.user.sub || req.user.id;
    return this.advisorsService.getLeadsForAdvisor(userId);
  }
}
