import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PaymentService } from './payment.service';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { RedeemCouponDto } from './dto/redeem-coupon.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Payment')
@Controller('payment')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADVISOR)
@ApiBearerAuth()
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Post('create-intent')
  @Throttle({ default: { limit: 10, ttl: 3600 } })
  @ApiOperation({ summary: 'Create payment intent for advisor membership' })
  @ApiResponse({ 
    status: 200, 
    description: 'Payment intent created successfully',
    schema: {
      type: 'object',
      properties: {
        clientSecret: { type: 'string' },
        amount: { type: 'number' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid coupon code' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not an advisor' })
  @ApiBody({ type: CreatePaymentIntentDto })
  async createPaymentIntent(@Request() req, @Body() createPaymentDto: CreatePaymentIntentDto) {
    // Creates Stripe payment intent for $5,000 membership fee with optional coupon discount
    return this.paymentService.createPaymentIntent(req.user._id, createPaymentDto.couponCode);
  }

  @Post('confirm')
  @Throttle({ default: { limit: 5, ttl: 3600 } })
  @ApiOperation({ summary: 'Confirm payment and activate advisor profile' })
  @ApiResponse({ 
    status: 200, 
    description: 'Payment confirmed and profile activated',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Payment not completed or invalid' })
  @ApiResponse({ status: 404, description: 'Advisor profile not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({ type: ConfirmPaymentDto })
  async confirmPayment(@Request() req, @Body() confirmPaymentDto: ConfirmPaymentDto) {
    // Confirms Stripe payment and activates advisor profile
    return this.paymentService.confirmPayment(req.user._id, confirmPaymentDto.paymentIntentId);
  }

  @Post('redeem-coupon')
  @Throttle({ default: { limit: 3, ttl: 3600 } })
  @ApiOperation({ summary: 'Redeem coupon for free trial activation' })
  @ApiResponse({ 
    status: 200, 
    description: 'Coupon redeemed and profile activated',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid coupon or not for free trial' })
  @ApiResponse({ status: 404, description: 'Coupon not found or advisor profile not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({ type: RedeemCouponDto })
  async redeemCoupon(@Request() req, @Body() redeemCouponDto: RedeemCouponDto) {
    // Redeems free trial coupon and activates advisor profile without payment
    return this.paymentService.redeemCoupon(req.user._id, redeemCouponDto.code);
  }
}