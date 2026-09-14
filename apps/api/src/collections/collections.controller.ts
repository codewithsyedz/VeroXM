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
import { CollectionsService } from './collections.service.js';
import type { CollectionInput } from './collections.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProjectRoleGuard } from '../authz/project-role.guard.js';
import { RequireProjectRole } from '../authz/require-project-role.decorator.js';

// The JWT's `sub` claim is a string (NextAuth's `user.id` convention —
// see apps/web/src/lib/auth.ts), not a number. Every call site below
// coerces with Number(...), matching ProjectRoleGuard/ProjectsController's
// existing pattern — passing the raw string into a Prisma Int field or
// filter throws PrismaClientValidationError ("Expected Int, provided
// String"), which both fork() and createVersion() actually did until
// this fix (caught by manually testing Versions end-to-end).
interface AuthedRequest {
  user?: { sub?: string | number };
}

// Phase 6: project-role-scoped, admin-only — matches the legacy
// CollectionsController, which requires super_admin or admin{project_id}
// on every method (editors cannot change schema; see docs/PHASE-6-NOTES.md).
// The clone/fork/dependencies/versions routes added this phase have no
// legacy equivalent at all — see collections.service.ts for what each does
// and why.
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Controller('projects/:projectId/collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  // Read-only: any project-tier role that can see content at all needs
  // to know what collections exist (the Content review page's filter,
  // and the sidebar on a content entry's edit page) — 'admin' here was
  // blocking every Editor from the Content section entirely (discovered
  // 2026-09-12 while live-testing the approval workflow with a bare
  // Editor test account: this call 403'd, and the page didn't handle
  // that, so the whole Content page 500'd for every non-admin user).
  // Only the schema-MUTATING routes below stay admin-only — this list
  // read never lets an Editor change anything, matching the "editors
  // cannot change schema, but can read it" split the legacy app's own
  // content forms depend on.
  @Get()
  @RequireProjectRole('viewer')
  findAll(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.collectionsService.findAllForProject(projectId);
  }

  @Post()
  @RequireProjectRole('admin')
  create(@Param('projectId', ParseIntPipe) projectId: number, @Body() body: CollectionInput) {
    return this.collectionsService.create(projectId, body);
  }

  // Declared before the ':id' routes below so it isn't shadowed by them —
  // Nest/Express match routes in registration order.
  @Patch('reorder')
  @RequireProjectRole('admin')
  reorder(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: { items: Array<{ id: number; order: number }> },
  ) {
    return this.collectionsService.reorder(projectId, body.items ?? []);
  }

  // Read-only, same reasoning as findAll() above — this is the exact
  // call the content entry edit page makes to get the collection's field
  // schema (collection.fields) and sibling-collection list before it can
  // render ContentForm at all. An Editor without this can't be shown the
  // form, let alone submit it — 'admin' made content editing impossible
  // for every non-admin project role.
  @Get(':id')
  @RequireProjectRole('viewer')
  findOne(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.collectionsService.findOne(projectId, id);
  }

  @Patch(':id')
  @RequireProjectRole('admin')
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CollectionInput,
  ) {
    return this.collectionsService.update(projectId, id, body);
  }

  @Delete(':id')
  @RequireProjectRole('admin')
  remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.collectionsService.remove(projectId, id);
  }

  // --- Clone / Fork -------------------------------------------------------

  @Post(':id/clone')
  @RequireProjectRole('admin')
  clone(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.collectionsService.clone(projectId, id);
  }

  // The guard only checks admin access on the URL's :projectId (the
  // SOURCE project) — collectionsService.fork() itself re-checks admin
  // access against the request body's targetProjectId before writing
  // anything there, since that project is never in the guard's URL.
  @Post(':id/fork')
  @RequireProjectRole('admin')
  fork(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { targetProjectId: number },
    @Req() req: AuthedRequest,
  ) {
    return this.collectionsService.fork(
      projectId,
      id,
      Number(body.targetProjectId),
      Number(req.user?.sub) || 0,
    );
  }

  // --- Dependencies ---------------------------------------------------------

  @Get(':id/dependencies')
  @RequireProjectRole('admin')
  dependencies(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.collectionsService.dependencies(projectId, id);
  }

  // --- Versions / Comparison ------------------------------------------------

  @Get(':id/versions')
  @RequireProjectRole('admin')
  listVersions(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.collectionsService.listVersions(projectId, id);
  }

  @Post(':id/versions')
  @RequireProjectRole('admin')
  createVersion(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { label?: string },
    @Req() req: AuthedRequest,
  ) {
    return this.collectionsService.createVersion(
      projectId,
      id,
      body.label,
      req.user?.sub !== undefined ? Number(req.user.sub) : undefined,
    );
  }

  @Delete(':id/versions/:versionId')
  @RequireProjectRole('admin')
  deleteVersion(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
  ) {
    return this.collectionsService.deleteVersion(projectId, id, versionId);
  }

  @Get(':id/versions/:versionId/compare')
  @RequireProjectRole('admin')
  compareVersions(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @Query('to') to?: string,
  ) {
    const toVersionId = !to || to === 'current' ? 'current' : Number(to);
    return this.collectionsService.compareVersions(projectId, id, versionId, toVersionId);
  }
}
