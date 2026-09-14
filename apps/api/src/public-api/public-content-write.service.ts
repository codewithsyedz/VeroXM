import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  decodeFieldValue,
  encodeFieldValue,
  isEmptyValue,
  validateContentData,
  type FieldRow,
} from '../content/content-field-codec.js';

// The public API's create/update/delete — mirrors API\ContentController's
// create()/update()/delete() (legacy): fields arrive flat in the request
// body (no `data` wrapper, unlike the admin API), there's no created_by/
// updated_by (public writes aren't attributed to an admin user), locale
// defaults to the project's default_locale when omitted, and publish
// state is driven by an inverted `draft` flag — present and truthy means
// "leave unpublished", its absence means "publish immediately". That's the
// opposite default from the admin API's `published` flag and is easy to
// get backwards, so it's called out here and in docs/PHASE-5-NOTES.md.
@Injectable()
export class PublicContentWriteService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadCollection(projectId: number, slug: string) {
    const collection = await this.prisma.collection.findFirst({
      where: { projectId, slug, deletedAt: null },
      include: { fields: true },
    });
    if (!collection) throw new NotFoundException({ error: 'Collection not found!' });
    return collection;
  }

  async create(
    projectId: number,
    defaultLocale: string,
    slug: string,
    body: Record<string, unknown>,
  ) {
    const collection = await this.loadCollection(projectId, slug);
    const fields = collection.fields as unknown as FieldRow[];

    const { locale, draft, ...data } = body;

    const errors = await validateContentData(
      fields,
      data,
      async (fieldName, value) => {
        const clash = await this.prisma.contentMeta.findFirst({
          where: { collectionId: collection.id, fieldName, value, deletedAt: null },
        });
        return !!clash;
      },
      '',
    );
    if (errors) throw new BadRequestException({ errors });

    const created = await this.prisma.content.create({
      data: {
        projectId,
        collectionId: collection.id,
        locale: typeof locale === 'string' ? locale : defaultLocale,
        createdBy: null,
        publishedAt: draft ? null : new Date(),
        publishedBy: null,
      },
    });

    for (const field of fields) {
      const raw = data[field.name];
      if (isEmptyValue(raw)) continue;
      const value = await encodeFieldValue(field, raw, null);
      await this.prisma.contentMeta.create({
        data: { projectId, collectionId: collection.id, contentId: created.id, fieldName: field.name, value },
      });
    }

    return this.toResource(created.id, projectId, collection.id, fields);
  }

  async update(projectId: number, slug: string, contentId: number, body: Record<string, unknown>) {
    const collection = await this.loadCollection(projectId, slug);
    const fields = collection.fields as unknown as FieldRow[];

    const content = await this.prisma.content.findFirst({ where: { id: contentId } });
    if (!content) throw new NotFoundException({ error: 'Record not found!' });

    const { locale, draft, ...data } = body;

    const errors = await validateContentData(
      fields,
      data,
      async (fieldName, value) => {
        const clash = await this.prisma.contentMeta.findFirst({
          where: {
            collectionId: collection.id,
            fieldName,
            value,
            deletedAt: null,
            contentId: { not: contentId },
          },
        });
        return !!clash;
      },
      '',
      // A PATCH body is a partial update by nature — a field the caller
      // never mentions isn't being changed, so it shouldn't have to
      // satisfy "required" just because create() would demand it. A
      // field explicitly sent as empty/null still fails required (see
      // validateContentData's `omitted` check).
      { partial: true },
    );
    if (errors) throw new BadRequestException({ errors });

    await this.prisma.content.update({
      where: { id: contentId },
      data: {
        // A PATCH body normally sends only the fields the caller is
        // changing. Falling back to `null` here (unlike create(), which
        // falls back to the project's defaultLocale) silently wiped the
        // record's locale on every update that didn't re-send it — fall
        // back to the record's current locale instead so an update that
        // doesn't touch locale doesn't destroy it.
        locale: typeof locale === 'string' ? locale : content.locale,
        publishedAt: draft ? null : new Date(),
      },
    });

    const existing = await this.prisma.contentMeta.findMany({ where: { contentId } });
    const existingByName = new Map<string, { id: number; value: string | null }>(
      existing.map((m: { id: number; fieldName: string; value: string | null }) => [m.fieldName, m]),
    );

    for (const field of fields) {
      if (!(field.name in data)) continue;
      const raw = data[field.name];
      const prior = existingByName.get(field.name);
      const value = await encodeFieldValue(field, raw, prior?.value ?? null);

      if (prior) {
        await this.prisma.contentMeta.update({ where: { id: prior.id }, data: { value } });
      } else if (!isEmptyValue(raw)) {
        await this.prisma.contentMeta.create({
          data: { projectId, collectionId: collection.id, contentId, fieldName: field.name, value },
        });
      }
    }

    return this.toResource(contentId, projectId, collection.id, fields);
  }

  async remove(projectId: number, slug: string, contentId: number) {
    const collection = await this.loadCollection(projectId, slug);
    const content = await this.prisma.content.findFirst({ where: { id: contentId } });
    if (!content) throw new NotFoundException({ error: 'Record not found!' });

    await this.prisma.$transaction([
      this.prisma.contentMeta.deleteMany({ where: { contentId } }),
      this.prisma.content.delete({ where: { id: contentId } }),
    ]);
  }

  // A lighter version of PublicContentService.shapeContent() — write
  // endpoints return the flat field values but skip the recursive media/
  // relation resolution the read endpoints do, since a create/update
  // response is mainly a write acknowledgement.
  private async toResource(contentId: number, projectId: number, collectionId: number, fields: FieldRow[]) {
    const content = await this.prisma.content.findFirst({
      where: { id: contentId },
      include: { meta: { where: { deletedAt: null } } },
    });
    const byName = new Map(
      (content?.meta ?? []).map((m: { fieldName: string; value: string | null }) => [m.fieldName, m.value]),
    );

    const out: Record<string, unknown> = { id: contentId, locale: content?.locale ?? null };
    if (content?.publishedAt) out.published_at = content.publishedAt;

    for (const field of fields) {
      if (!byName.has(field.name)) continue;
      if ((field.options as any)?.hiddenInAPI) continue;
      if (field.type === 'password') continue;
      out[field.name] = decodeFieldValue(field, byName.get(field.name) as string | null | undefined);
    }
    return out;
  }
}
