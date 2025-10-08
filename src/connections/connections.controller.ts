import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConnectionsService } from './connections.service';
import { IntroductionDto } from './dto/introduction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Connections')
@Controller('connections')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SELLER)
@ApiBearerAuth()
export class ConnectionsController {
  constructor(private connectionsService: ConnectionsService) {}

  @Post('introduction')
  @Throttle({ default: { limit: 5, ttl: 3600 } }) // 5 requests per hour
  @ApiOperation({ summary: 'Send introduction emails to selected advisors' })
  @ApiResponse({
    status: 200,
    description: 'Introduction emails sent successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        emailsSent: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid advisor IDs or not from matches',
  })
  @ApiResponse({ status: 404, description: 'Seller profile not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a seller' })
  @ApiResponse({ status: 429, description: 'Too many requests - rate limited' })
  @ApiBody({ type: IntroductionDto })
  async sendIntroductions(
    @Request() req,
    @Body() introductionDto: IntroductionDto,
  ) {
    // Sends professional introduction emails to selected advisors, copying the seller
    const userId = req.user._doc?._id || req.user._id || req.user.sub || req.user.id;
    return this.connectionsService.sendIntroductions(
      userId,
      introductionDto,
    );
  }

  @Post('direct-list')
  @Throttle({ default: { limit: 3, ttl: 3600 } }) // 3 requests per hour
  @ApiOperation({
    summary: 'Send direct contact list to seller and notify advisors',
  })
  @ApiResponse({
    status: 200,
    description: 'Contact list sent and advisors notified',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        advisorCount: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Seller profile not found or no matches',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a seller' })
  @ApiResponse({ status: 429, description: 'Too many requests - rate limited' })
  async sendDirectContactList(@Request() req) {
    // Sends direct contact list to seller and notifications to all matched advisors
    const userId = req.user._doc?._id || req.user._id || req.user.sub || req.user.id;
    return this.connectionsService.sendDirectContactList(userId);
  }
}
