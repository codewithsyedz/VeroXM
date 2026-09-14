import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ContentService } from './content.service.js';
import type { ContentListQuery } from './content.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProjectRoleGuard } from '../authz/project-role.guard.js';
import { RequireProjectRole } from '../authz/require-project-role.decorator.js';

// Project-wide entry list — read-only, and the only route in this stack
// that isn't scoped to a single collection. This is a genuinely
// read-only GET (ContentController's own list()/findOne() were loosened
// to 'viewer' for the same reason — docs/RBAC-TENANT-RECOMMENDATION.md
// §8 step 5's Developer/Viewer slice) — it was missed in that pass
// because it lives in its own controller/file rather than alongside
// ContentController, and was caught live: a Viewer-role project (18)
// could open /projects/collections but the Content tab still 403'd,
// since apps/web's content/page.tsx calls THIS route, not
// ContentController's collection-scoped one.
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Controller('projects/:projectId/content')
export class ProjectContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get()
  @RequireProjectRole('viewer')
  list(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query() query: Record<string, string>,
  ) {
    const listQuery: ContentListQuery = {
      page: query.page ? Number(query.page) : undefined,
      each: query.each ? Number(query.each) : undefined,
      search: query.search,
      orderBy: query.orderBy,
      cr: query.cr === 'ASC' ? 'ASC' : 'DESC',
      getItems: (query.getItems as ContentListQuery['getItems']) ?? undefined,
    };
    return this.contentService.listForProject(projectId, listQuery);
  }
}
