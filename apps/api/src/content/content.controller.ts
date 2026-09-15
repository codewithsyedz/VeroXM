import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ContentService } from './content.service.js';
import type { ContentInput, ContentListQuery } from './content.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProjectRoleGuard } from '../authz/project-role.guard.js';
import { RequireProjectRole } from '../authz/require-project-role.decorator.js';

// The JWT's `sub` claim is a string (NextAuth's `user.id` convention —
// see apps/web/src/lib/auth.ts), not a number, despite how convenient it
// would be to type it that way here. Every call site below coerces with
// Number(...), matching the pattern ProjectRoleGuard/ProjectsController
// already established — passing the raw string into a Prisma Int field
// write throws PrismaClientValidationError ("Expected Int, provided
// String"), which is exactly what was happening here before this fix.
interface AuthedRequest {
  user?: { sub?: string | number };
}

// Phase 6: project-role-scoped — matches the legacy ContentController,
// which allows super_admin, admin{project_id}, or editor{project_id} on
// every method (see docs/PHASE-6-NOTES.md).
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Controller('projects/:projectId/collections/:collectionId/content')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get()
  @RequireProjectRole('viewer')
  list(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Query() query: Record<string, string>,
  ) {
    const listQuery: ContentListQuery = {
      page: query.page ? Number(query.page) : undefined,
      each: query.each ? Number(query.each) : undefined,
      search: query.search,
      orderBy: query.orderBy,
      cr: query.cr === 'DESC' ? 'DESC' : query.cr === 'ASC' ? 'ASC' : undefined,
      sbm: query.sbm === 'true' || query.sbm === '1',
      getItems: (query.getItems as ContentListQuery['getItems']) ?? undefined,
      // docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §4.2.
      locale: query.locale || undefined,
    };
    return this.contentService.list(projectId, collectionId, listQuery);
  }

  @Get(':id')
  @RequireProjectRole('viewer')
  findOne(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.contentService.findOne(projectId, collectionId, id);
  }

  @Post()
  @RequireProjectRole('editor')
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Body() body: ContentInput,
    @Req() req: AuthedRequest,
  ) {
    return this.contentService.create(projectId, collectionId, Number(req.user?.sub) || 0, body);
  }

  @Patch(':id')
  @RequireProjectRole('editor')
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ContentInput,
    @Req() req: AuthedRequest,
  ) {
    return this.contentService.update(projectId, collectionId, id, Number(req.user?.sub) || 0, body);
  }

  @Post(':id/publish')
  @RequireProjectRole('editor')
  publish(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthedRequest,
  ) {
    return this.contentService.publish(projectId, collectionId, id, Number(req.user?.sub) || 0);
  }

  @Post(':id/unpublish')
  @RequireProjectRole('editor')
  unpublish(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.contentService.unpublish(projectId, collectionId, id);
  }

  // docs/RBAC-TENANT-RECOMMENDATION.md §6, §8 step 6 — 'editor' tier at
  // the guard level (same as every other route here) is deliberately
  // loose: it just means "has some access to this project." The real
  // gate — does this specific user's role satisfy the CURRENT step's
  // requiredRoleKind — is checked inside ContentService.approveContent/
  // rejectContent, the same split PermissionGuard-gated routes elsewhere
  // don't need here since this isn't a flat permission, it's "whichever
  // role this particular in-flight step demands."
  @Get(':id/approval')
  @RequireProjectRole('viewer')
  approvalStatus(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthedRequest,
  ) {
    return this.contentService.getApprovalStatus(projectId, collectionId, id, Number(req.user?.sub) || 0);
  }

  @Post(':id/approval/approve')
  @RequireProjectRole('editor')
  approve(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { comment?: string },
    @Req() req: AuthedRequest,
  ) {
    return this.contentService.approveContent(projectId, collectionId, id, Number(req.user?.sub) || 0, body?.comment);
  }

  @Post(':id/approval/reject')
  @RequireProjectRole('editor')
  reject(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { comment?: string },
    @Req() req: AuthedRequest,
  ) {
    return this.contentService.rejectContent(projectId, collectionId, id, Number(req.user?.sub) || 0, body?.comment);
  }

  @Post(':id/trash')
  @RequireProjectRole('editor')
  trash(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.contentService.trash(projectId, collectionId, id);
  }

  @Post(':id/restore')
  @RequireProjectRole('editor')
  restore(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.contentService.restore(projectId, collectionId, id);
  }

  @Delete(':id')
  @RequireProjectRole('editor')
  remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.contentService.remove(projectId, collectionId, id);
  }
}
