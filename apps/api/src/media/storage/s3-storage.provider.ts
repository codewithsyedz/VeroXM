import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import type { StorageProvider } from './storage-provider.interface.js';

// Same bucket + key convention as the legacy app's Flysystem S3 disk
// (`public/{uuid}/...`, see Media::getFullUrlAttribute in the legacy repo)
// so both stacks read/write the same objects.
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly bucket = process.env.AWS_S3_BUCKET as string;
  private readonly client = new S3Client({ region: process.env.AWS_REGION });

  private originalKey(projectUuid: string, filename: string) {
    return `public/${projectUuid}/${filename}`;
  }

  private thumbnailKey(projectUuid: string, filename: string) {
    return `public/${projectUuid}/thumbnails/${filename}`;
  }

  async exists(projectUuid: string, filename: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.originalKey(projectUuid, filename) }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async putOriginal(projectUuid: string, filename: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.originalKey(projectUuid, filename),
        Body: data,
        ACL: 'public-read',
      }),
    );
  }

  async putThumbnail(projectUuid: string, filename: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.thumbnailKey(projectUuid, filename),
        Body: data,
        ACL: 'public-read',
      }),
    );
  }

  async deleteOriginal(projectUuid: string, filename: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.originalKey(projectUuid, filename) }),
    );
  }

  async deleteThumbnail(projectUuid: string, filename: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.thumbnailKey(projectUuid, filename) }),
    );
  }

  urlFor(projectUuid: string, filename: string): string {
    const base = process.env.AWS_S3_URL_BASE ?? `https://${this.bucket}.s3.amazonaws.com`;
    return `${base}/${this.originalKey(projectUuid, filename)}`;
  }

  thumbUrlFor(projectUuid: string, filename: string): string {
    const base = process.env.AWS_S3_URL_BASE ?? `https://${this.bucket}.s3.amazonaws.com`;
    return `${base}/${this.thumbnailKey(projectUuid, filename)}`;
  }
}
