import { PartialType } from '@nestjs/swagger';
import { CreateSellerProfileDto } from './create-seller-profile.dto';

export class UpdateSellerProfileDto extends PartialType(
  CreateSellerProfileDto,
) {}
