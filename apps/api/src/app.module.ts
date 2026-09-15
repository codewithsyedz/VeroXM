import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { CollectionsModule } from './collections/collections.module.js';
import { CollectionFieldsModule } from './collection-fields/collection-fields.module.js';
import { ContentModule } from './content/content.module.js';
import { MediaModule } from './media/media.module.js';
import { PermissionsModule } from './permissions/permissions.module.js';
import { PublicApiModule } from './public-api/public-api.module.js';
import { ApiTokensModule } from './api-tokens/api-tokens.module.js';
import { ApiAuthUsersModule } from './api-auth-users/api-auth-users.module.js';
import { ApiAnalyticsModule } from './api-analytics/api-analytics.module.js';
import { RoleManagementModule } from './role-management/role-management.module.js';
import { DepartmentsModule } from './departments/departments.module.js';
import { ApprovalWorkflowsModule } from './approval-workflows/approval-workflows.module.js';
import { ImpersonationModule } from './impersonation/impersonation.module.js';
import { CustomRolesModule } from './custom-roles/custom-roles.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JobsModule } from './jobs/jobs.module.js';
import { ReadCacheModule } from './read-cache/read-cache.module.js';
import { CdnPurgeModule } from './cdn-purge/cdn-purge.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';

@Module({
  imports: [
    // Global on purpose (forRoot(), no options needed yet) -- registered
    // once here so any module can inject EventEmitter2 or use @OnEvent
    // without importing this module again itself. First (and so far
    // only) consumer is WebhooksModule; see
    // docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.1.
    EventEmitterModule.forRoot(),
    // Global (JobsModule is @Global()) -- registers the shared BullMQ/Redis
    // connection once here so feature modules only need
    // BullModule.registerQueue() for the queue(s) they own. First (and so
    // far only) consumer is WebhooksModule; see
    // docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.3.
    JobsModule,
    // Global (ReadCacheModule is @Global()) -- docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md
    // §4.1. Depends on JobsModule only in the sense that both share the
    // same Redis instance/REDIS_URL, not on anything JobsModule provides.
    ReadCacheModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    CollectionsModule,
    CollectionFieldsModule,
    ContentModule,
    MediaModule,
    PermissionsModule,
    PublicApiModule,
    ApiTokensModule,
    ApiAuthUsersModule,
    ApiAnalyticsModule,
    RoleManagementModule,
    DepartmentsModule,
    ApprovalWorkflowsModule,
    ImpersonationModule,
    CustomRolesModule,
    TenantsModule,
    WebhooksModule,
    CdnPurgeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
