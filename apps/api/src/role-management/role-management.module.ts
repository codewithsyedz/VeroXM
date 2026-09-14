import { Module } from '@nestjs/common';
import { RoleManagementController } from './role-management.controller.js';
import { RoleManagementService } from './role-management.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';

@Module({
  imports: [AuthModule, AuthzModule],
  controllers: [RoleManagementController],
  providers: [RoleManagementService],
})
export class RoleManagementModule {}
