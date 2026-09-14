import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Put, Req, UseGuards } from '@nestjs/common';
import { ApprovalWorkflowsService } from './approval-workflows.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

interface AuthedRequest {
  user?: { sub?: number };
}

// docs/RBAC-TENANT-RECOMMENDATION.md §11.6 — a Project-level override of
// its Department's approval workflow (§6.3's own flagged fast-follow).
// Separate controller (not more routes bolted onto
// ApprovalWorkflowsController) because the base path differs
// (`projects/:projectId/...` vs `departments/:departmentId/...`) and
// NestJS controllers are one base path each — same split
// ProjectsController/DepartmentsController already have for their own
// unrelated resources. Same shape otherwise: JwtAuthGuard only,
// authorization resolved inline by the service against a :projectId, not
// the project-scoped PermissionGuard (this isn't a per-project role tier
// like content:read/write — it's Department Admin/Tenant Admin/Super
// Admin territory, the same authority that configures the Department's
// own workflow).
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/approval-workflow')
export class ProjectApprovalWorkflowController {
  constructor(private readonly approvalWorkflowsService: ApprovalWorkflowsService) {}

  private userId(req: AuthedRequest): number {
    const id = Number(req.user?.sub);
    if (!id) throw new ForbiddenException('Not authenticated');
    return id;
  }

  @Get()
  get(@Req() req: AuthedRequest, @Param('projectId', ParseIntPipe) projectId: number) {
    return this.approvalWorkflowsService.getProjectWorkflow(this.userId(req), projectId);
  }

  @Put()
  set(
    @Req() req: AuthedRequest,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: { steps: { requiredRoleKind: string }[] },
  ) {
    return this.approvalWorkflowsService.setProjectSteps(this.userId(req), projectId, body.steps ?? []);
  }

  @Delete()
  async remove(@Req() req: AuthedRequest, @Param('projectId', ParseIntPipe) projectId: number) {
    await this.approvalWorkflowsService.removeProjectWorkflow(this.userId(req), projectId);
    return { success: true };
  }
}
