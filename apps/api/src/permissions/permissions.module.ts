import { Module } from '@nestjs/common';
import { MyPermissionsController } from './my-permissions.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';

// Phase 0 stub was empty pending Phase 1+ per the migration roadmap; now
// also hosts the docs/RBAC-TENANT-RECOMMENDATION.md §5.2/§8-step-2
// proof-of-concept route (see MyPermissionsController's own header).
@Module({
  imports: [AuthModule, AuthzModule],
  controllers: [MyPermissionsController],
})
export class PermissionsModule {}
