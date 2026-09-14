import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiAnalyticsService } from './api-analytics.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProjectRoleGuard } from '../authz/project-role.guard.js';
import { RequireProjectRole } from '../authz/require-project-role.decorator.js';

// Same tier as ApiTokensController — reading traffic analytics for a
// project is a project-settings-level capability, not something editors
// need (see docs/PHASE-7-NOTES.md).
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Controller('projects/:projectId/analytics')
export class ApiAnalyticsController {
  constructor(private readonly analytics: ApiAnalyticsService) {}

  @Get('summary')
  @RequireProjectRole('admin')
  summary(@Param('projectId', ParseIntPipe) projectId: number, @Query('range') range?: string) {
    return this.analytics.summary(projectId, range);
  }

  @Get('timeseries')
  @RequireProjectRole('admin')
  timeseries(@Param('projectId', ParseIntPipe) projectId: number, @Query('range') range?: string) {
    return this.analytics.timeseries(projectId, range);
  }

  @Get('endpoints')
  @RequireProjectRole('admin')
  endpoints(@Param('projectId', ParseIntPipe) projectId: number, @Query('range') range?: string) {
    return this.analytics.endpoints(projectId, range);
  }

  @Get('ips')
  @RequireProjectRole('admin')
  ips(@Param('projectId', ParseIntPipe) projectId: number, @Query('range') range?: string) {
    return this.analytics.ips(projectId, range);
  }

  @Get('logs')
  @RequireProjectRole('admin')
  logs(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('method') method?: string,
    @Query('status') status?: string,
  ) {
    return this.analytics.logs(projectId, {
      limit: limit !== undefined ? Number(limit) : undefined,
      offset: offset !== undefined ? Number(offset) : undefined,
      method,
      status,
    });
  }
}
