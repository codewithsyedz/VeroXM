import { Module } from '@nestjs/common';
import { ApprovalWorkflowsController } from './approval-workflows.controller.js';
import { ProjectApprovalWorkflowController } from './project-approval-workflow.controller.js';
import { ApprovalWorkflowsService } from './approval-workflows.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';

@Module({
  imports: [AuthModule, AuthzModule],
  // docs/RBAC-TENANT-RECOMMENDATION.md §11.6: ProjectApprovalWorkflowController
  // added alongside the Department-level controller — both share the one
  // ApprovalWorkflowsService, which now exposes both scopes' methods.
  controllers: [ApprovalWorkflowsController, ProjectApprovalWorkflowController],
  providers: [ApprovalWorkflowsService],
  exports: [ApprovalWorkflowsService],
})
export class ApprovalWorkflowsModule {}
