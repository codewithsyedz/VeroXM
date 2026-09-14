import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CollectionFieldsService } from './collection-fields.service.js';
import type { CollectionFieldInput } from './collection-fields.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProjectRoleGuard } from '../authz/project-role.guard.js';
import { RequireProjectRole } from '../authz/require-project-role.decorator.js';

// The JWT's `sub` claim is a string (NextAuth's `user.id` convention —
// see apps/web/src/lib/auth.ts). fork() below coerces with Number(...),
// matching ProjectRoleGuard/ProjectsController's existing pattern —
// passing the raw string into a Prisma Int filter throws
// PrismaClientValidationError ("Expected Int, provided String").
interface AuthedRequest {
  user?: { sub?: string | number };
}

// Phase 6: project-role-scoped, admin-only — same tier as
// CollectionsController (see docs/PHASE-6-NOTES.md).
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Controller('projects/:projectId/collections/:collectionId/fields')
export class CollectionFieldsController {
  constructor(private readonly collectionFieldsService: CollectionFieldsService) {}

  @Post()
  @RequireProjectRole('admin')
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Body() body: CollectionFieldInput,
  ) {
    return this.collectionFieldsService.create(projectId, collectionId, body);
  }

  // Declared before ':id' so it isn't shadowed by that route.
  @Patch('reorder')
  @RequireProjectRole('admin')
  reorder(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Body() body: { items: Array<{ id: number; order: number }> },
  ) {
    return this.collectionFieldsService.reorder(projectId, collectionId, body.items ?? []);
  }

  @Patch(':id')
  @RequireProjectRole('admin')
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CollectionFieldInput,
  ) {
    return this.collectionFieldsService.update(projectId, collectionId, id, body);
  }

  @Delete(':id')
  @RequireProjectRole('admin')
  remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.collectionFieldsService.remove(projectId, collectionId, id);
  }

  // --- Clone / Fork (per-field — see collection-fields.service.ts) --------

  @Post(':id/clone')
  @RequireProjectRole('admin')
  clone(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.collectionFieldsService.clone(projectId, collectionId, id);
  }

  @Post(':id/fork')
  @RequireProjectRole('admin')
  fork(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { targetCollectionId: number },
    @Req() req: AuthedRequest,
  ) {
    return this.collectionFieldsService.fork(
      projectId,
      collectionId,
      id,
      Number(body.targetCollectionId),
      Number(req.user?.sub) || 0,
    );
  }
}
