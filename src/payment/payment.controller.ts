import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Headers,
  Req,
  Get,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PaymentService } from './payment.service';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { RedeemCouponDto } from './dto/redeem-coupon.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { FinalizeSubscriptionDto } from './dto/finalize-subscription.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import type { Request as ExpressRequest } from 'express';

@ApiTags('Payment')
@Controller('payment')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Post('create-intent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 3600 } })
  @ApiOperation({ summary: 'Create payment intent for advisor membership' })
  @ApiResponse({
    status: 200,
    description: 'Payment intent created successfully',
    schema: {
      type: 'object',
      properties: {
        clientSecret: { type: 'string' },
        amount: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid coupon code' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not an advisor' })
  @ApiBody({ type: CreatePaymentIntentDto })
  async createPaymentIntent(
    @Request() req,
    @Body() createPaymentDto: CreatePaymentIntentDto,
  ) {
    // Creates Stripe payment intent for $5,000 membership fee with optional coupon discount
    return this.paymentService.createPaymentIntent(
      req.user._id,
      createPaymentDto.couponCode,
    );
  }

  @Post('confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 3600 } })
  @ApiOperation({ summary: 'Confirm payment and activate advisor profile' })
  @ApiResponse({
    status: 200,
    description: 'Payment confirmed and profile activated',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Payment not completed or invalid' })
  @ApiResponse({ status: 404, description: 'Advisor profile not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({ type: ConfirmPaymentDto })
  async confirmPayment(
    @Request() req,
    @Body() confirmPaymentDto: ConfirmPaymentDto,
  ) {
    // Confirms Stripe payment and activates advisor profile
    return this.paymentService.confirmPayment(
      req.user._id,
      confirmPaymentDto.paymentIntentId,
    );
  }

  @Post('redeem-coupon')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 3600 } })
  @ApiOperation({ summary: 'Redeem coupon for free trial activation' })
  @ApiResponse({
    status: 200,
    description: 'Coupon redeemed and profile activated',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid coupon or not for free trial',
  })
  @ApiResponse({
    status: 404,
    description: 'Coupon not found or advisor profile not found',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({ type: RedeemCouponDto })
  async redeemCoupon(@Request() req, @Body() redeemCouponDto: RedeemCouponDto) {
    // Redeems free trial coupon and activates advisor profile without payment
    return this.paymentService.redeemCoupon(req.user._id, redeemCouponDto.code);
  }

  @Post('setup-coupons')
  @ApiOperation({ summary: 'Create a new coupon for advisor subscriptions' })
  @ApiResponse({ status: 201, description: 'Coupon created successfully' })
  @ApiBody({ type: CreateCouponDto })
  async createCoupon(@Body() createCouponDto: CreateCouponDto) {
    const coupon = await this.paymentService.createCoupon(createCouponDto);
    return { message: 'Coupon created successfully', coupon };
  }

  @Get('coupons')
  @ApiOperation({ summary: 'List available coupons with usage limits' })
  @ApiResponse({ status: 200, description: 'List of coupons retrieved' })
  async listCoupons() {
    return this.paymentService.listCoupons();
  }

  @Post('webhook')
  @ApiOperation({
    summary: 'Stripe webhook endpoint for payment confirmations',
  })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid webhook signature' })
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: ExpressRequest & { rawBody?: Buffer },
  ) {
    // Public endpoint for Stripe to send payment confirmations
    // No authentication required - Stripe signature verification handles security
    return this.paymentService.handleWebhook(
      signature,
      req.rawBody || Buffer.from(''),
    );
  }

  @Get('history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get subscription and payment history' })
  async getHistory(@Request() req) {
    console.log(
      '[PaymentController] GET /payment/history for user',
      req.user?._id,
    );
    return this.paymentService.getHistory(req.user._id);
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel subscription at period end' })
  async cancel(@Request() req) {
    console.log(
      '[PaymentController] POST /payment/cancel for user',
      req.user?._id,
    );
    const { subscription } = await this.paymentService.cancelAtPeriodEnd(
      req.user._id,
    );
    return {
      success: true,
      subscription,
      message: 'Subscription will cancel at period end',
    };
  }

  @Post('resume')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resume subscription (undo cancel at period end)' })
  async resume(@Request() req) {
    console.log(
      '[PaymentController] POST /payment/resume for user',
      req.user?._id,
    );
    const { subscription } = await this.paymentService.resume(req.user._id);
    return { success: true, subscription };
  }
}
