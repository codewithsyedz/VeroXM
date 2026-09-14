import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ProjectsService } from './projects.service.js';
import type { CreateProjectInput, UpdateProjectInput } from './projects.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProjectRoleGuard } from '../authz/project-role.guard.js';
import { RequireProjectRole } from '../authz/require-project-role.decorator.js';

interface AuthedRequest {
  user?: { sub?: number };
}

// Phase 1: read-only. Write endpoints (create/update/delete, locales, user
// assignment, API tokens — see ProjectsController.php in the legacy app)
// remain Laravel-only for now (see docs/PHASE-6-NOTES.md — project/role
// creation and user assignment are explicitly out of scope for this pass).
//
// Phase 6: findOne is project-role-scoped like every other module (editor
// tier, matching the legacy show()). findAll isn't gated by
// ProjectRoleGuard — there's no single project to scope it to — instead
// ProjectsService.findAll() filters the result set itself, matching the
// legacy index()'s exact behavior (super_admin sees all; anyone else only
// sees projects they hold a role in).
//
// Post-Phase-6: `create` ports the legacy store() (see ProjectsService for
// the full breakdown of what's ported vs. intentionally omitted).
// Authenticated-only, matching legacy exactly — no ProjectRoleGuard, since
// there's no project yet to check a role against, and legacy itself has no
// check here either. `update` is new (name/description edits and
// Live/Staging both have no legacy equivalent) and is admin-tier, same as
// every other schema/settings write in this codebase. `slug` isn't
// accepted by `update` — it's set once at creation and immutable.
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll(
    @Req() req: AuthedRequest,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.projectsService.findAll(Number(req.user?.sub), search, status);
  }

  @Get(':id')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole('viewer')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.findOne(id);
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() body: CreateProjectInput) {
    return this.projectsService.create(Number(req.user?.sub), body);
  }

  @Patch(':id')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole('admin')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateProjectInput) {
    return this.projectsService.update(id, body);
  }

  // super_admin only — matches legacy's delete(), which checks
  // isSuperAdmin() and nothing else (not admin{id}, unlike update() above).
  @Delete(':id')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole('super_admin')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.remove(id);
  }
}
