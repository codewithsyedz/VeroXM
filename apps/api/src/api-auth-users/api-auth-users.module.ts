import { Module } from '@nestjs/common';
import { ApiAuthUsersController } from './api-auth-users.controller.js';
import { ApiAuthUsersService } from './api-auth-users.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';

@Module({
  imports: [AuthModule, AuthzModule],
  controllers: [ApiAuthUsersController],
  providers: [ApiAuthUsersService],
  // Exported so PublicApiModule can reuse this service's login/refresh
  // methods from ProjectApiAuthController, instead of a second copy of
  // the bcrypt/JWT/refresh-token plumbing.
  exports: [ApiAuthUsersService],
})
export class ApiAuthUsersModule {}
