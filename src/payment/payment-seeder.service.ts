import { Injectable, OnModuleInit } from '@nestjs/common';
import { PaymentService } from './payment.service';

@Injectable()
export class PaymentSeederService implements OnModuleInit {
  constructor(private paymentService: PaymentService) {}

  async onModuleInit() {
    // Create sample coupons on application startup
    try {
      await this.paymentService.createSampleCoupons();
      console.log('Sample coupons created successfully');
    } catch (error) {
      console.log('Sample coupons already exist or error:', error.message);
    }
  }
}