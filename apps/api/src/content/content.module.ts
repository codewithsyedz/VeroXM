import { Module } from '@nestjs/common';
import { ContentController } from './content.controller.js';
import { ProjectContentController } from './project-content.controller.js';
import { MyApprovalsController } from './my-approvals.controller.js';
import { ContentService } from './content.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';

@Module({
  imports: [AuthModule, AuthzModule],
  controllers: [ContentController, ProjectContentController, MyApprovalsController],
  providers: [ContentService],
})
export class ContentModule {}
