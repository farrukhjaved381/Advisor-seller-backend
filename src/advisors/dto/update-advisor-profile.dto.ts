import { PartialType } from '@nestjs/swagger';
import { CreateAdvisorProfileDto } from './create-advisor-profile.dto';

export class UpdateAdvisorProfileDto extends PartialType(
  CreateAdvisorProfileDto,
) {}
