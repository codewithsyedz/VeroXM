import { Injectable, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageFactory } from './storage/storage.factory.js';
import { IMAGE_EXTENSIONS } from './storage/storage-provider.interface.js';

const PAGE_SIZE = 24; // matches the legacy admin media library's pagination

// Matches the `media` table's columns — kept as an explicit local type
// rather than importing Prisma's generated `Media` model, since this repo's
// Prisma client hasn't actually been generated against the real schema in
// every environment (see docs/PHASE-2-NOTES.md).
export interface MediaRow {
  id: number;
  name: string;
  type: string | null;
  caption: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  disk: string | null;
}

export interface MediaView {
  id: number;
  fileName: string;
  fullUrl: string;
  thumbUrl: string | null;
  caption: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageFactory,
  ) {}

  private async loadProjectOrThrow(projectId: number) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    return project;
  }

  private toView(media: MediaRow, projectUuid: string): MediaView {
    const provider = this.storage.for(media.disk);
    const isImage = !!media.type && (IMAGE_EXTENSIONS as readonly string[]).includes(media.type);

    return {
      id: media.id,
      fileName: media.name,
      fullUrl: provider.urlFor(projectUuid, media.name),
      thumbUrl: isImage ? provider.thumbUrlFor(projectUuid, media.name) : null,
      caption: media.caption,
      size: media.size,
      width: isImage ? media.width : null,
      height: isImage ? media.height : null,
    };
  }

  async list(projectId: number, { page = 1, search }: { page?: number; search?: string }) {
    const project = await this.loadProjectOrThrow(projectId);

    const where = {
      projectId,
      ...(search ? { name: { contains: search } } : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.media.count({ where }),
      this.prisma.media.findMany({
        where,
        orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    return {
      data: rows.map((row: MediaRow) => this.toView(row, project.uuid)),
      page,
      perPage: PAGE_SIZE,
      total,
    };
  }

  // Mirrors the legacy renameFile() collision strategy — "name(1).ext",
  // "name(2).ext", ... — but splits on the LAST dot rather than the first,
  // so filenames with multiple dots ("q3.report.png") don't lose everything
  // after the first one the way the legacy PHP (explode('.', ...)) does.
  private async resolveUniqueFilename(
    provider: ReturnType<StorageFactory['for']>,
    projectUuid: string,
    originalName: string,
  ): Promise<string> {
    const ext = path.extname(originalName);
    const base = path.basename(originalName, ext);

    let filename = originalName;
    let i = 1;
    while (await provider.exists(projectUuid, filename)) {
      filename = `${base}(${i})${ext}`;
      i++;
    }
    return filename;
  }

  async upload(
    projectId: number,
    file: { originalname: string; buffer: Buffer; size: number },
    caption?: string,
  ): Promise<MediaView> {
    const project = await this.loadProjectOrThrow(projectId);
    const provider = this.storage.for(project.disk);

    const filename = await this.resolveUniqueFilename(provider, project.uuid, file.originalname);
    const extension = path.extname(filename).replace('.', '').toLowerCase();
    const isImage = (IMAGE_EXTENSIONS as readonly string[]).includes(extension);

    await provider.putOriginal(project.uuid, filename, file.buffer);

    let width: number | null = null;
    let height: number | null = null;

    if (isImage) {
      const image = sharp(file.buffer);
      const metadata = await image.metadata();
      width = metadata.width ?? null;
      height = metadata.height ?? null;

      // Matches the legacy Intervention::resize(null, 600, aspectRatio) —
      // fixed height, width follows the aspect ratio.
      // NOTE: sharp has no BMP encoder, and GIF re-encoding support varies
      // by libvips build — for those two extensions we fall back to storing
      // the original as its own "thumbnail" rather than failing the upload.
      try {
        const resized = image.resize({ height: 600, withoutEnlargement: false });
        const thumbBuffer = await this.encodeAs(resized, extension);
        await provider.putThumbnail(project.uuid, filename, thumbBuffer);
      } catch {
        await provider.putThumbnail(project.uuid, filename, file.buffer);
      }
    }

    const created = await this.prisma.media.create({
      data: {
        projectId: project.id,
        name: filename,
        type: extension,
        size: file.size,
        width,
        height,
        disk: project.disk,
        caption: caption ?? null,
      },
    });

    return this.toView(created, project.uuid);
  }

  private async encodeAs(image: sharp.Sharp, extension: string): Promise<Buffer> {
    switch (extension) {
      case 'jpg':
      case 'jpeg':
        return image.jpeg().toBuffer();
      case 'png':
        return image.png().toBuffer();
      case 'webp':
        return image.webp().toBuffer();
      case 'gif':
        return image.gif().toBuffer();
      default:
        // bmp and anything else: no sharp encoder — throw so the caller's
        // fallback (store the original as the thumbnail) takes over.
        throw new Error(`No thumbnail encoder for .${extension}`);
    }
  }

  async updateCaption(projectId: number, mediaId: number, caption: string): Promise<MediaView> {
    const project = await this.loadProjectOrThrow(projectId);

    const media = await this.prisma.media.findFirst({
      where: { id: mediaId, projectId },
    });
    if (!media) throw new NotFoundException(`Media ${mediaId} not found`);

    const updated = await this.prisma.media.update({
      where: { id: mediaId },
      data: { caption },
    });

    return this.toView(updated, project.uuid);
  }

  async remove(projectId: number, mediaId: number): Promise<void> {
    const project = await this.loadProjectOrThrow(projectId);

    const media = await this.prisma.media.findFirst({
      where: { id: mediaId, projectId },
    });
    if (!media) throw new NotFoundException(`Media ${mediaId} not found`);

    const provider = this.storage.for(media.disk);
    await provider.deleteOriginal(project.uuid, media.name);
    await provider.deleteThumbnail(project.uuid, media.name);

    await this.prisma.media.delete({ where: { id: mediaId } });
  }
}
