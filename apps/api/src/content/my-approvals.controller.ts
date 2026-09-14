import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ContentService } from './content.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

interface AuthedRequest {
  user?: { sub?: string | number };
}

// docs/RBAC-TENANT-RECOMMENDATION.md §11.8 -- deliberately its own
// top-level controller (not nested under ContentController's
// projects/:projectId/collections/:collectionId/content path, and not
// gated by ProjectRoleGuard) since this answers "what's waiting on ME,
// across every project" rather than anything scoped to one project.
// Mirrors DepartmentsController's precedent for a JwtAuthGuard-only route
// that resolves its own authorization internally (here, per-request,
// inside ContentService.getPendingApprovalsForUser).
@UseGuards(JwtAuthGuard)
@Controller('approvals')
export class MyApprovalsController {
  constructor(private readonly contentService: ContentService) {}

  @Get('pending')
  getPending(@Req() req: AuthedRequest) {
    const userId = Number(req.user?.sub) || 0;
    return this.contentService.getPendingApprovalsForUser(userId);
  }
}
