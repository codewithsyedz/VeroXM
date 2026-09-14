import { Injectable } from '@nestjs/common';
import { LocalStorageProvider } from './local-storage.provider.js';
import { S3StorageProvider } from './s3-storage.provider.js';
import type { StorageProvider } from './storage-provider.interface.js';

@Injectable()
export class StorageFactory {
  constructor(
    private readonly local: LocalStorageProvider,
    private readonly s3: S3StorageProvider,
  ) {}

  for(disk: string | null | undefined): StorageProvider {
    return disk === 's3' ? this.s3 : this.local;
  }
}
