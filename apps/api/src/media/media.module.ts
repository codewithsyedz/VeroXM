import { Module } from '@nestjs/common';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';
import { LocalStorageProvider } from './storage/local-storage.provider.js';
import { S3StorageProvider } from './storage/s3-storage.provider.js';
import { StorageFactory } from './storage/storage.factory.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';

@Module({
  imports: [AuthModule, AuthzModule],
  controllers: [MediaController],
  providers: [MediaService, LocalStorageProvider, S3StorageProvider, StorageFactory],
  // StorageFactory is exported so ProjectsService can delete a project's
  // media files (not just its DB rows) when the project itself is
  // deleted — see ProjectsService.remove(). MediaService is exported too,
  // so PublicApiModule can reuse it for the public, ability-gated v2 media
  // routes (V2MediaController) instead of a second copy of the upload/
  // thumbnail/storage-provider logic.
  exports: [StorageFactory, MediaService],
})
export class MediaModule {}
