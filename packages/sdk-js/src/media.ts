import type { VeroXMApp } from './client.js';

export interface MediaItem {
  id: number;
  fileName: string;
  fullUrl: string;
  thumbUrl: string | null;
  caption: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
}

export interface MediaPage {
  data: MediaItem[];
  page: number;
  perPage: number;
  total: number;
}

/**
 * A Blob/File (browser -- e.g. straight from an `<input type="file">` or
 * `fetch()` response) uploads as-is; the `{data, filename}` form covers
 * Node/React Native, where raw bytes usually arrive as an ArrayBuffer or
 * Uint8Array rather than a Blob.
 */
export type UploadableFile = Blob | { data: Blob | ArrayBuffer | Uint8Array; filename: string; contentType?: string };

export class MediaResource {
  constructor(private readonly app: VeroXMApp) {}

  async list(options: { page?: number; search?: string } = {}): Promise<MediaPage> {
    return this.app.request({
      path: '/media',
      query: { page: options.page, search: options.search },
    }) as Promise<MediaPage>;
  }

  /** Images are thumbnailed server-side automatically; other file types are stored as-is. Max size is whatever this project's server allows (commonly 20MB). */
  async upload(file: UploadableFile, caption?: string): Promise<MediaItem> {
    const form = new FormData();
    if (file instanceof Blob) {
      form.append('file', file);
    } else {
      // TS's DOM lib types Uint8Array as generic over ArrayBufferLike (which
      // includes SharedArrayBuffer), which BlobPart's own typing doesn't
      // accept -- a type-checker-only mismatch, not a real runtime one,
      // since both an ArrayBuffer and any ArrayBufferView are valid Blob
      // constructor parts in every actual runtime this SDK targets.
      const blob = file.data instanceof Blob ? file.data : new Blob([file.data as BlobPart], { type: file.contentType });
      form.append('file', blob, file.filename);
    }
    if (caption) form.append('caption', caption);

    return this.app.request({ method: 'POST', path: '/media/upload', form }) as Promise<MediaItem>;
  }

  async updateCaption(id: number, caption: string): Promise<MediaItem> {
    return this.app.request({
      method: 'PATCH',
      path: `/media/${id}`,
      json: { caption },
    }) as Promise<MediaItem>;
  }

  async delete(id: number): Promise<void> {
    await this.app.request({ method: 'DELETE', path: `/media/${id}` });
  }
}
