import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Put, Req, UseGuards } from '@nestjs/common';
import { ApprovalWorkflowsService } from './approval-workflows.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

interface AuthedRequest {
  user?: { sub?: number };
}

// docs/RBAC-TENANT-RECOMMENDATION.md §6.3, §8 step 6. Same shape as
// DepartmentsController — JwtAuthGuard only, authorization resolved
// inline by the service against a :departmentId, not the project-scoped
// PermissionGuard.
@UseGuards(JwtAuthGuard)
@Controller('departments/:departmentId/approval-workflow')
export class ApprovalWorkflowsController {
  constructor(private readonly approvalWorkflowsService: ApprovalWorkflowsService) {}

  private userId(req: AuthedRequest): number {
    const id = Number(req.user?.sub);
    if (!id) throw new ForbiddenException('Not authenticated');
    return id;
  }

  @Get()
  get(@Req() req: AuthedRequest, @Param('departmentId', ParseIntPipe) departmentId: number) {
    return this.approvalWorkflowsService.getWorkflow(this.userId(req), departmentId);
  }

  @Put()
  set(
    @Req() req: AuthedRequest,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Body() body: { steps: { requiredRoleKind: string }[] },
  ) {
    return this.approvalWorkflowsService.setSteps(this.userId(req), departmentId, body.steps ?? []);
  }

  @Delete()
  async remove(@Req() req: AuthedRequest, @Param('departmentId', ParseIntPipe) departmentId: number) {
    await this.approvalWorkflowsService.removeWorkflow(this.userId(req), departmentId);
    return { success: true };
  }
}
