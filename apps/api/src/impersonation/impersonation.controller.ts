import { Body, Controller, ForbiddenException, Post, Req, UseGuards } from '@nestjs/common';
import { ImpersonationService } from './impersonation.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

interface AuthedRequest {
  // `actingAs` is the extra claim apps/web/src/lib/auth.ts's jwt callback
  // signs into the API token whenever it's minting one for an
  // impersonated identity -- it carries the REAL actor's id, whereas
  // `sub` is (deliberately) the target's id for every other route's
  // authorization to work. The audit trail (ImpersonationAuditLog.actorId)
  // always records the real human, so start/end here must resolve back
  // to `actingAs` when present -- using raw `sub` would attribute a
  // /impersonation/end call made *while already impersonating* to the
  // target instead of the real actor, which silently breaks the
  // ownership check in ImpersonationService.end (log.actorId would never
  // match).
  user?: { sub?: number; actingAs?: number };
}

// docs/RBAC-TENANT-RECOMMENDATION.md §7, §8 step 7. Same JwtAuthGuard-only
// pattern as DepartmentsController/ApprovalWorkflowsController -- these
// routes aren't scoped to a :projectId, so the project-scoped
// PermissionGuard doesn't apply; authorization is resolved inline via
// RolesService.canImpersonate instead.
//
// Called server-to-server only, from Next.js server actions via
// process.env.API_URL (apps/web/.../impersonation-actions.ts) -- same
// situation as /departments, so no gateway block is needed (see
// docker/nginx/gateway.conf's comment on /departments for why).
@UseGuards(JwtAuthGuard)
@Controller('impersonation')
export class ImpersonationController {
  constructor(private readonly impersonationService: ImpersonationService) {}

  private userId(req: AuthedRequest): number {
    const id = Number(req.user?.actingAs ?? req.user?.sub);
    if (!id) throw new ForbiddenException('Not authenticated');
    return id;
  }

  @Post('start')
  start(@Req() req: AuthedRequest, @Body() body: { targetUserId: number; reason?: string }) {
    return this.impersonationService.start(this.userId(req), Number(body.targetUserId), body.reason);
  }

  @Post('end')
  async end(@Req() req: AuthedRequest, @Body() body: { auditLogId: number }) {
    await this.impersonationService.end(this.userId(req), Number(body.auditLogId));
    return { success: true };
  }
}
