import { Controller, Post, Get, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { AdvisorsService } from './advisors.service';
import { CreateAdvisorProfileDto } from './dto/create-advisor-profile.dto';
import { UpdateAdvisorProfileDto } from './dto/update-advisor-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PaymentVerifiedGuard } from '../auth/guards/payment-verified.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Advisors')
@Controller('advisors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADVISOR)
@ApiBearerAuth()
export class AdvisorsController {
  constructor(private advisorsService: AdvisorsService) {}

  @Post('profile')
  @ApiOperation({ summary: 'Create advisor profile' })
  @ApiResponse({ status: 201, description: 'Profile created successfully' })
  @ApiResponse({ status: 409, description: 'Profile already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not an advisor' })
  @ApiBody({ type: CreateAdvisorProfileDto })
  async createProfile(@Request() req, @Body() createProfileDto: CreateAdvisorProfileDto) {
    // Creates advisor profile linked to authenticated user
    return this.advisorsService.createProfile(req.user._id, createProfileDto);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current advisor profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@Request() req) {
    // Retrieves current advisor's profile
    return this.advisorsService.getProfileByUserId(req.user._id);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update advisor profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({ type: UpdateAdvisorProfileDto })
  async updateProfile(@Request() req, @Body() updateProfileDto: UpdateAdvisorProfileDto) {
    // Updates advisor profile fields
    return this.advisorsService.updateProfile(req.user._id, updateProfileDto);
  }

  @Patch('profile/pause-leads')
  @ApiOperation({ summary: 'Toggle lead sending status' })
  @ApiResponse({ status: 200, description: 'Lead status updated successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({ 
    schema: { 
      type: 'object', 
      properties: { sendLeads: { type: 'boolean' } },
      required: ['sendLeads']
    }
  })
  async toggleLeads(@Request() req, @Body() body: { sendLeads: boolean }) {
    // Toggles whether advisor receives leads
    return this.advisorsService.toggleLeadSending(req.user._id, body.sendLeads);
  }

  @Post('testimonials')
  @ApiOperation({ summary: 'Add testimonial to advisor profile' })
  @ApiResponse({ status: 201, description: 'Testimonial added successfully' })
  @ApiResponse({ status: 400, description: 'Maximum 5 testimonials allowed' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        clientName: { type: 'string' },
        testimonial: { type: 'string' },
        pdfUrl: { type: 'string' }
      },
      required: ['clientName', 'testimonial']
    }
  })
  async addTestimonial(@Request() req, @Body() testimonialData: { clientName: string; testimonial: string; pdfUrl?: string }) {
    return this.advisorsService.addTestimonial(req.user._id, testimonialData);
  }

  @Patch('logo')
  @ApiOperation({ summary: 'Update advisor logo URL' })
  @ApiResponse({ status: 200, description: 'Logo updated successfully' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { logoUrl: { type: 'string' } },
      required: ['logoUrl']
    }
  })
  async updateLogo(@Request() req, @Body() body: { logoUrl: string }) {
    return this.advisorsService.updateLogo(req.user._id, body.logoUrl);
  }
}