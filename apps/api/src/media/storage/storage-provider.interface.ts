// One provider per legacy `disk` value ('local' | 's3'). All paths mirror
// the legacy Flysystem layout exactly (`public/{project.uuid}/{filename}`,
// `public/{project.uuid}/thumbnails/{filename}`) so files either stack
// writes are visible to the other during the parallel-run.
export interface StorageProvider {
  exists(projectUuid: string, filename: string): Promise<boolean>;
  putOriginal(projectUuid: string, filename: string, data: Buffer): Promise<void>;
  putThumbnail(projectUuid: string, filename: string, data: Buffer): Promise<void>;
  deleteOriginal(projectUuid: string, filename: string): Promise<void>;
  deleteThumbnail(projectUuid: string, filename: string): Promise<void>;
  urlFor(projectUuid: string, filename: string): string;
  thumbUrlFor(projectUuid: string, filename: string): string;
}

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'webp'] as const;
