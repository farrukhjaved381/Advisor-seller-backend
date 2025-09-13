import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdvisorsController } from './advisors.controller';
import { AdvisorsService } from './advisors.service';
import { Advisor, AdvisorSchema } from './schemas/advisor.schema';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { ConnectionsModule } from '../connections/connections.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Advisor.name, schema: AdvisorSchema }]),
    UsersModule,
    forwardRef(() => AuthModule),
    ConnectionsModule,
  ],
  controllers: [AdvisorsController],
  providers: [AdvisorsService],
  exports: [AdvisorsService],
})
export class AdvisorsModule {}