import { Body, Controller, Delete, Get, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { CdnPurgeConfigsService } from './cdn-purge-configs.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../authz/permission.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';

// Same gating rationale as WebhooksController -- see its own comment.
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('projects/:projectId/cdn-purge-config')
export class CdnPurgeController {
  constructor(private readonly configs: CdnPurgeConfigsService) {}

  @Get()
  @RequirePermission('api-tokens:manage')
  get(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.configs.get(projectId);
  }

  @Put()
  @RequirePermission('api-tokens:manage')
  upsert(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: { provider: string; zoneId: string; apiToken?: string; enabled: boolean },
  ) {
    return this.configs.upsert(projectId, body);
  }

  @Delete()
  @RequirePermission('api-tokens:manage')
  remove(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.configs.remove(projectId);
  }
}
