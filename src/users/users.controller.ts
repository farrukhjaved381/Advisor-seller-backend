import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from './schemas/user.schema';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  @Get('protected')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test protected route - requires authentication' })
  @ApiResponse({
    status: 200,
    description: 'Access granted to protected route',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing token',
  })
  getProtected(@Request() req) {
    // Validates JWT and attaches user to request
    return {
      message: 'Protected route accessed successfully',
      user: {
        id: req.user._id,
        email: req.user.email,
        role: req.user.role,
      },
    };
  }

  @Get('advisor-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Advisor only route - requires advisor role' })
  @ApiResponse({ status: 200, description: 'Access granted to advisor route' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  getAdvisorOnly(@Request() req) {
    // RBAC: Only advisor users can access this endpoint
    return {
      message: 'Advisor route accessed successfully',
      advisor: {
        id: req.user._id,
        email: req.user.email,
        role: req.user.role,
      },
    };
  }

  @Get('seller-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SELLER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Seller only route - requires seller role' })
  @ApiResponse({ status: 200, description: 'Access granted to seller route' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  getSellerOnly(@Request() req) {
    // RBAC: Only seller users can access this endpoint
    return {
      message: 'Seller route accessed successfully',
      seller: {
        id: req.user._id,
        email: req.user.email,
        role: req.user.role,
      },
    };
  }
}
