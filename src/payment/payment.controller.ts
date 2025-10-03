import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Headers,
  Req,
  Get,
  Patch,
  Param,
  Delete,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiConsumes,
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
import { ExtendCouponUsageDto } from './dto/extend-coupon-usage.dto';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
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
  @UseInterceptors(AnyFilesInterceptor())
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary: 'Create a new coupon',
    description:
      'Fill in this form to create a coupon you can share in emails or chats. The percentage decides how much of the $5,000 advisor membership fee will be waived.',
  })
  @ApiResponse({ status: 201, description: 'Coupon created successfully' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['code', 'discountPercentage'],
      properties: {
        code: {
          type: 'string',
          example: 'GROWTH75',
          description:
            'Short code you will send to advisors. Letters or numbers only, no spaces.',
        },
        discountPercentage: {
          type: 'number',
          example: 75,
          minimum: 1,
          maximum: 100,
          description:
            'How much of the $5,000 advisor fee to waive. 100 makes it a completely free coupon.',
        },
        usageLimit: {
          type: 'integer',
          nullable: true,
          example: 5,
          description:
            'How many people can use this code before it stops working. Leave empty for unlimited.',
        },
        expiresDate: {
          type: 'string',
          format: 'date',
          nullable: true,
          example: '2025-12-31',
          description:
            'Pick the calendar date you want this coupon to stop working.',
        },
        expiresTime: {
          type: 'string',
          format: 'time',
          nullable: true,
          example: '17:00',
          description:
            'Pick the time on that day when the coupon should expire. Leave empty to expire at the end of the day.',
        },
        expiresAt: {
          type: 'string',
          format: 'date-time',
          nullable: true,
          example: '2025-12-31T23:59:59.000Z',
          description:
            'Advanced: manually type a custom ISO date/time if you prefer not to use the calendar inputs.',
        },
      },
    },
  })
  async createCoupon(@Body() createCouponDto: CreateCouponDto) {
    const coupon = await this.paymentService.createCoupon(createCouponDto);
    return { message: 'Coupon created successfully', coupon };
  }

  @Get('coupons')
  @ApiOperation({
    summary: 'View all coupons',
    description:
      'Shows every coupon you have created along with the percentage discount, how many times it has been used, and when it expires.',
  })
  @ApiResponse({ status: 200, description: 'List of coupons retrieved' })
  async listCoupons() {
    return this.paymentService.listCoupons();
  }

  @Patch('coupons/:code/usage')
  @UseInterceptors(AnyFilesInterceptor())
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary: 'Add more uses or change expiration for a coupon',
    description:
      'Use this when a coupon is running out or you want to keep it available longer. You can add more uses, set a brand-new total limit, or refresh the expiration date.',
  })
  @ApiParam({
    name: 'code',
    description:
      'Coupon code exactly as shown in the coupon list (not case sensitive).',
    example: 'GROWTH75',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        additionalUses: {
          type: 'integer',
          example: 10,
          description:
            'Add this many extra uses on top of the current limit (for example, typing 10 allows 10 more people).',
        },
        newTotalLimit: {
          type: 'integer',
          example: 40,
          description:
            'Set a brand-new total usage limit. Use this if you prefer to define the exact total number of uses.',
        },
        newExpirationDate: {
          type: 'string',
          format: 'date',
          example: '2026-01-31',
          description:
            'Pick the calendar date for the new expiration. Leave blank to keep the current date.',
        },
        newExpirationTime: {
          type: 'string',
          format: 'time',
          example: '17:00',
          description:
            'Pick the time on that day when the coupon should expire. Leave blank to keep the end-of-day default.',
        },
        newExpirationDateTime: {
          type: 'string',
          format: 'date-time',
          example: '2026-01-31T23:59:59.000Z',
          description:
            'Advanced: manually type the full ISO date/time if you do not want to use the calendar inputs.',
        },
        clearExpiration: {
          type: 'boolean',
          example: false,
          description:
            'Turn on to remove the expiration date altogether so the coupon stays active until the usage limit is reached.',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Coupon updated successfully' })
  async extendCouponUsage(
    @Param('code') code: string,
    @Body() extendDto: ExtendCouponUsageDto,
  ) {
    const coupon = await this.paymentService.extendCouponUsage(code, extendDto);

    return { message: 'Coupon updated successfully', coupon };
  }

  @Delete('coupons/:code')
  @ApiOperation({
    summary: 'Delete a coupon',
    description:
      'Removes a coupon completely so it can no longer be used. This also removes it from Stripe if it was connected there.',
  })
  @ApiParam({
    name: 'code',
    description:
      'Coupon code exactly as shown in the coupon list (not case sensitive).',
    example: 'GROWTH75',
  })
  @ApiResponse({ status: 200, description: 'Coupon deleted successfully' })
  async deleteCoupon(@Param('code') code: string) {
    return this.paymentService.deleteCoupon(code);
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
