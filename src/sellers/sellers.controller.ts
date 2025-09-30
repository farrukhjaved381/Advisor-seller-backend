import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { SellersService } from './sellers.service';
import { CreateSellerProfileDto } from './dto/create-seller-profile.dto';
import { UpdateSellerProfileDto } from './dto/update-seller-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { MatchingService } from '../matching/matching.service';
import { AdvisorCardDto } from '../matching/dto/advisor-card.dto';

@ApiTags('Sellers')
@Controller('sellers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SELLER)
@ApiBearerAuth()
export class SellersController {
  constructor(
    private sellersService: SellersService,
    private matchingService: MatchingService,
  ) {}

  @Post('profile')
  @ApiOperation({ summary: 'Create seller profile' })
  @ApiResponse({ status: 201, description: 'Profile created successfully' })
  @ApiResponse({ status: 409, description: 'Profile already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a seller' })
  @ApiBody({ type: CreateSellerProfileDto })
  async createProfile(
    @Request() req,
    @Body() createProfileDto: CreateSellerProfileDto,
  ) {
    // Creates seller profile linked to authenticated user
    return this.sellersService.createProfile(req.user._id, createProfileDto);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current seller profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@Request() req) {
    // Retrieves current seller's profile
    return this.sellersService.getProfileByUserId(req.user._id);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update seller profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({ type: UpdateSellerProfileDto })
  async updateProfile(
    @Request() req,
    @Body() updateProfileDto: UpdateSellerProfileDto,
  ) {
    // Updates seller profile fields
    return this.sellersService.updateProfile(req.user._id, updateProfileDto);
  }

  @Get('matches')
  @ApiOperation({ summary: 'Get matched advisors for current seller' })
  @ApiResponse({
    status: 200,
    description: 'Array of matched advisor cards',
    type: [AdvisorCardDto],
  })
  @ApiResponse({ status: 404, description: 'Seller profile not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'Sort criteria: years, company, or default (newest)',
    enum: ['years', 'company'],
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number for pagination (1-based)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page for pagination',
  })
  async getMatches(
    @Request() req,
    @Query('sortBy') sortBy?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<AdvisorCardDto[]> {
    // Finds and returns matched advisors based on industry, geography, revenue, and active status
    const pageNum = page ? Math.max(parseInt(page, 10) || 1, 1) : undefined;
    const limitNum = limit ? Math.max(parseInt(limit, 10) || 0, 0) : undefined;
    return this.matchingService.findMatches(
      req.user._id,
      sortBy,
      pageNum,
      limitNum,
    );
  }

  @Get('matches/stats')
  @ApiOperation({ summary: 'Get matching statistics' })
  @ApiResponse({
    status: 200,
    description: 'Matching statistics',
    schema: {
      type: 'object',
      properties: {
        totalMatches: { type: 'number' },
        industries: { type: 'array', items: { type: 'string' } },
        geographies: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Seller profile not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMatchStats(@Request() req) {
    // Returns matching statistics for analytics
    return this.matchingService.getMatchStats(req.user._id);
  }

  @Delete('profile')
  @ApiOperation({ summary: 'Delete seller profile' })
  @ApiResponse({ status: 200, description: 'Profile deleted successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteProfile(@Request() req) {
    return this.sellersService.deleteProfile(req.user._id);
  }

  @Patch('profile/status')
  @ApiOperation({ summary: 'Toggle seller profile active status' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { isActive: { type: 'boolean' } },
      required: ['isActive'],
    },
  })
  async toggleActiveStatus(
    @Request() req,
    @Body() body: { isActive: boolean },
  ) {
    return this.sellersService.toggleActiveStatus(req.user._id, body.isActive);
  }
}
