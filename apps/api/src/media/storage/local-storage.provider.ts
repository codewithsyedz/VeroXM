import { Injectable } from '@nestjs/common';
import { promises as fs, existsSync } from 'fs';
import * as path from 'path';
import type { StorageProvider } from './storage-provider.interface.js';

// Writes to LOCAL_MEDIA_ROOT — during the parallel-run, point this at the
// LEGACY app's `storage/app/public` directory (see apps/api/.env.example)
// so both stacks share one physical volume and see each other's uploads.
//
// Deliberately NOT serving these files over HTTP: the legacy Laravel app's
// existing `uploads/{dir}/{file}` route keeps doing that until a later
// migration phase — this provider only manages the files, not the request
// path that serves their bytes.
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly root = process.env.LOCAL_MEDIA_ROOT ?? './media-storage';
  private readonly appUrl = process.env.APP_URL ?? 'http://localhost:8000';

  private originalPath(projectUuid: string, filename: string) {
    return path.join(this.root, projectUuid, filename);
  }

  private thumbnailPath(projectUuid: string, filename: string) {
    return path.join(this.root, projectUuid, 'thumbnails', filename);
  }

  async exists(projectUuid: string, filename: string): Promise<boolean> {
    return existsSync(this.originalPath(projectUuid, filename));
  }

  async putOriginal(projectUuid: string, filename: string, data: Buffer): Promise<void> {
    const filePath = this.originalPath(projectUuid, filename);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
  }

  async putThumbnail(projectUuid: string, filename: string, data: Buffer): Promise<void> {
    const filePath = this.thumbnailPath(projectUuid, filename);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
  }

  async deleteOriginal(projectUuid: string, filename: string): Promise<void> {
    await fs.rm(this.originalPath(projectUuid, filename), { force: true });
  }

  async deleteThumbnail(projectUuid: string, filename: string): Promise<void> {
    await fs.rm(this.thumbnailPath(projectUuid, filename), { force: true });
  }

  urlFor(projectUuid: string, filename: string): string {
    return `${this.appUrl}/uploads/${projectUuid}/${filename}`;
  }

  thumbUrlFor(projectUuid: string, filename: string): string {
    return `${this.appUrl}/uploads/thumb/${projectUuid}/${filename}`;
  }
}
