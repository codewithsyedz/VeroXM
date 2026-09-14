import { Module } from '@nestjs/common';
import { RolesService } from './roles.service.js';
import { ProjectRoleGuard } from './project-role.guard.js';
import { PermissionGuard } from './permission.guard.js';

@Module({
  providers: [RolesService, ProjectRoleGuard, PermissionGuard],
  exports: [RolesService, ProjectRoleGuard, PermissionGuard],
})
export class AuthzModule {}
