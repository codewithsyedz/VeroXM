import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiAuthUsersService } from '../api-auth-users/api-auth-users.service.js';

// Public, unauthenticated by design -- these two routes are how a caller
// gets a bearer token in the first place, so there's nothing to gate them
// on yet. Mounted at the same public/v2/projects/:uuid base the rest of
// the v2 API uses (see V2ContentController), so a client that already has
// the project's base URL only needs to append /auth/token or
// /auth/refresh.
@Controller('public/v2/projects/:uuid/auth')
export class ProjectApiAuthController {
  constructor(private readonly apiAuthUsersService: ApiAuthUsersService) {}

  @Post('token')
  login(@Param('uuid') uuid: string, @Body() body: { username?: string; password?: string }) {
    return this.apiAuthUsersService.login(uuid, body.username ?? '', body.password ?? '');
  }

  @Post('refresh')
  refresh(@Param('uuid') uuid: string, @Body() body: { refreshToken?: string }) {
    return this.apiAuthUsersService.refresh(uuid, body.refreshToken ?? '');
  }
}
