import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ApiAuthUsersModule } from '../api-auth-users/api-auth-users.module.js';
import { MediaModule } from '../media/media.module.js';
import { PublicApiAuthService } from './public-api-auth.service.js';
import { LegacyTokenGuard } from './legacy-token.guard.js';
import { V2TokenGuard } from './v2-token.guard.js';
import { PublicContentService } from './public-content.service.js';
import { PublicContentWriteService } from './public-content-write.service.js';
import { V1ContentController } from './v1/v1-content.controller.js';
import { V2ContentController } from './v2/v2-content.controller.js';
import { V2MediaController } from './v2/v2-media.controller.js';
import { ProjectApiAuthController } from './project-api-auth.controller.js';
import { ApiRequestLogMiddleware } from './api-request-log.middleware.js';

@Module({
  // AuthModule -- exports JwtService, needed both by PublicApiAuthService
  // (to verify a login-issued access token) and by ProjectApiAuthController
  // (to mint one). ApiAuthUsersModule -- exports ApiAuthUsersService, so
  // login/refresh reuse the exact same credential-verification and
  // token-issuance logic the internal CRUD controller uses, rather than a
  // second copy of the bcrypt/JWT/refresh-token plumbing. MediaModule --
  // exports MediaService, reused by V2MediaController so the public media
  // routes share the exact same upload/thumbnail/storage-provider logic
  // the dashboard's own MediaController uses.
  imports: [AuthModule, ApiAuthUsersModule, MediaModule],
  controllers: [V1ContentController, V2ContentController, V2MediaController, ProjectApiAuthController],
  providers: [
    PublicApiAuthService,
    LegacyTokenGuard,
    V2TokenGuard,
    PublicContentService,
    PublicContentWriteService,
    ApiRequestLogMiddleware,
  ],
})
export class PublicApiModule implements NestModule {
  // Runs ahead of every guarded controller (see ApiRequestLogMiddleware for
  // why this has to be middleware, not an interceptor) so every call is
  // logged for the Developer > API Analytics tab. Deliberately NOT applied
  // to ProjectApiAuthController -- login/refresh traffic has no
  // projectToken yet (that's the whole point of the route), so there'd be
  // nothing meaningful for this logger to attribute it to.
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ApiRequestLogMiddleware)
      .forRoutes(V1ContentController, V2ContentController, V2MediaController);
  }
}
