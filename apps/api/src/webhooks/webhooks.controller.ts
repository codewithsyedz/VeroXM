import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { WebhooksService } from './webhooks.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../authz/permission.guard.js';
import { RequirePermission } from '../authz/require-permission.decorator.js';

// Gated on the api-tokens:manage permission -- the closest existing fit
// for "manage this project's developer-facing integration surface"
// (mirrors ApiTokensController's own gating exactly). No dedicated
// webhooks:manage permission exists yet in authz/permissions.ts; adding
// one is a reasonable fast-follow but a separate, bigger change (it
// touches the role-kind -> permission-bundle map for every role) than
// this first cut needs.
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('projects/:projectId/webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get()
  @RequirePermission('api-tokens:manage')
  list(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.webhooksService.list(projectId);
  }

  @Post()
  @RequirePermission('api-tokens:manage')
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: { url: string; subscribedEvents: string[] },
  ) {
    return this.webhooksService.create(projectId, body.url, body.subscribedEvents);
  }

  @Patch(':webhookId')
  @RequirePermission('api-tokens:manage')
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('webhookId', ParseIntPipe) webhookId: number,
    @Body() body: { url?: string; subscribedEvents?: string[]; enabled?: boolean },
  ) {
    return this.webhooksService.update(projectId, webhookId, body);
  }

  @Delete(':webhookId')
  @RequirePermission('api-tokens:manage')
  remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('webhookId', ParseIntPipe) webhookId: number,
  ) {
    return this.webhooksService.remove(projectId, webhookId);
  }

  @Get(':webhookId/deliveries')
  @RequirePermission('api-tokens:manage')
  deliveries(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('webhookId', ParseIntPipe) webhookId: number,
  ) {
    return this.webhooksService.deliveries(projectId, webhookId);
  }

  @Post(':webhookId/test')
  @RequirePermission('api-tokens:manage')
  test(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('webhookId', ParseIntPipe) webhookId: number,
  ) {
    return this.webhooksService.sendTest(projectId, webhookId);
  }
}
