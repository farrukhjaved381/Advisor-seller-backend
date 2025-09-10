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
  @ApiOperation({ summary: 'Create advisor profile' })
  @ApiResponse({ status: 201, description: 'Profile created successfully' })
  @ApiResponse({ status: 409, description: 'Profile already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not an advisor' })
  @ApiBody({ type: CreateAdvisorProfileDto })
  async createProfile(@Request() req, @Body() createProfileDto: CreateAdvisorProfileDto) {
    return this.advisorsService.createProfile(req.user._id, createProfileDto);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current advisor profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getProfile(@Request() req) {
    return this.advisorsService.getProfileByUserId(req.user._id);
  }

  /**
   * ✅ Updated PATCH endpoint:
   * Accepts multipart/form-data for text fields + logo + testimonials
   */
  @Patch('profile')
  @ApiOperation({ summary: 'Update advisor profile (including logo & testimonials)' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'logo', maxCount: 1 },
        { name: 'testimonials', maxCount: 5 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 20 * 1024 * 1024 },
      },
    ),
  )
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        bio: { type: 'string' },
        industries: { type: 'string', example: 'Finance,Healthcare' },
        logo: { type: 'string', format: 'binary' },
        testimonials: { type: 'array', items: { type: 'string', format: 'binary' } },
        clientName: { type: 'string', example: 'John Doe' },
        testimonial: { type: 'string', example: 'Great advisor service' },
      },
    },
  })
  async updateProfile(
    @Request() req,
    @Body() updateProfileDto: any,
    @UploadedFiles()
    files: { logo?: Express.Multer.File[]; testimonials?: Express.Multer.File[] },
  ) {
    if (!updateProfileDto && !files) {
      throw new BadRequestException('No data or files provided for update');
    }
    return this.advisorsService.updateFullProfile(req.user._id, updateProfileDto, files);
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
}
