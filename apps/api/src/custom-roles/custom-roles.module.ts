import { Module } from '@nestjs/common';
import { CustomRolesController } from './custom-roles.controller.js';
import { CustomRolesService } from './custom-roles.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';

@Module({
  imports: [AuthModule, AuthzModule],
  controllers: [CustomRolesController],
  providers: [CustomRolesService],
})
export class CustomRolesModule {}
