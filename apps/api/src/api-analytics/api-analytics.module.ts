import { Module } from '@nestjs/common';
import { ApiAnalyticsController } from './api-analytics.controller.js';
import { ApiAnalyticsService } from './api-analytics.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';

@Module({
  imports: [AuthModule, AuthzModule],
  controllers: [ApiAnalyticsController],
  providers: [ApiAnalyticsService],
})
export class ApiAnalyticsModule {}
