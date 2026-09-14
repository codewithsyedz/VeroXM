import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import type { Prisma } from '@mycms/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { RolesService, USER_MODEL_TYPE } from '../authz/roles.service.js';
import { StorageFactory } from '../media/storage/storage.factory.js';
import { PROJECT_TOKENABLE_TYPE } from '../public-api/public-api-auth.service.js';

const PROJECT_LIST_SELECT = {
  id: true,
  uuid: true,
  name: true,
  slug: true,
  description: true,
  defaultLocale: true,
  locales: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const PROJECT_STATUSES = ['live', 'staging'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

// Matches the legacy store()'s `not_regex:/[#$%^&*()+=\-\[\]\';,\/{}|":<>?~\\]/`
// validation on `name` exactly, including the hyphen — a real quirk of the
// app being migrated, not something introduced here (see docs/PHASE-6-NOTES.md).
const INVALID_NAME_CHARS = /[#$%^&*()+=\-[\]';,/{}|":<>?~\\]/;

// `slug` has no legacy equivalent at all (see docs/PHASE-6-NOTES.md) —
// this is this stack's own convention, matching the same
// lowercase/hyphenated shape Collections already use (see
// CollectionsList.tsx's client-side `slugify()`).
const SLUG_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export interface CreateProjectInput {
  name: string;
  slug?: string;
  description?: string | null;
  defaultLocale?: string;
  status?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  status?: string;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
    private readonly storage: StorageFactory,
  ) {}

  // Matches the legacy index(): a super_admin sees every project; anyone
  // else only sees projects where they hold an admin{id} or editor{id}
  // role. Ported now (Phase 6) rather than earlier because this needed
  // the same role data the ProjectRoleGuard reads — see docs/PHASE-6-NOTES.md.
  //
  // Each row also carries a real collection/entry count so the projects
  // screen can show them without inventing numbers. These are two extra
  // grouped counts rather than Prisma's `_count` with a relation filter,
  // which would silently include soft-deleted rows unless the filtered
  // relation count feature is on — the explicit groupBy is portable and
  // says plainly what it excludes.
  //
  // `status` filters to a single real value ('live' | 'staging'); anything
  // else (including 'all' or omitted) returns every status, matching what
  // the Projects screen's All/Live/Staging pills need.
  async findAll(userId: number, search?: string, status?: string) {
    const roles = await this.rolesService.getUserRoles(userId);

    const accessibleIds = roles.isSuperAdmin
      ? undefined
      : [
          ...new Set([
            ...roles.adminProjectIds,
            ...roles.editorProjectIds,
            ...roles.developerProjectIds,
            ...roles.viewerProjectIds,
          ]),
        ];

    const statusFilter = PROJECT_STATUSES.includes(status as ProjectStatus)
      ? (status as ProjectStatus)
      : undefined;

    const projects = await this.prisma.project.findMany({
      where: {
        deletedAt: null,
        ...(search ? { name: { contains: search } } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(accessibleIds !== undefined ? { id: { in: accessibleIds } } : {}),
      },
      select: PROJECT_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    if (projects.length === 0) return [];

    const ids = projects.map((p: { id: number }) => p.id);

    const [collectionCounts, contentCounts] = await Promise.all([
      this.prisma.collection.groupBy({
        by: ['projectId'],
        where: { projectId: { in: ids }, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.content.groupBy({
        by: ['projectId'],
        where: { projectId: { in: ids }, deletedAt: null },
        _count: { _all: true },
      }),
    ]);

    type CountRow = { projectId: number; _count: { _all: number } };
    const collectionsByProject = new Map<number, number>(
      (collectionCounts as CountRow[]).map((r) => [r.projectId, r._count._all]),
    );
    const contentByProject = new Map<number, number>(
      (contentCounts as CountRow[]).map((r) => [r.projectId, r._count._all]),
    );

    return projects.map((project: (typeof projects)[number]) => ({
      ...project,
      collectionCount: collectionsByProject.get(project.id) ?? 0,
      contentCount: contentByProject.get(project.id) ?? 0,
    }));
  }

  async findOne(id: number) {
    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        collections: { where: { deletedAt: null }, orderBy: { order: 'asc' } },
      },
    });

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    return project;
  }

  // Ports the legacy store() faithfully:
  //   - same validation on `name` (required, blacklist regex) and
  //     `default_locale` (required, max 255)
  //   - `locales` is set equal to `default_locale` at creation, same as
  //     legacy
  //   - two roles (`admin{id}`/`editor{id}`) are created for the new
  //     project, same as legacy
  //
  // One deliberate deviation from legacy: legacy creates those two role
  // rows but never assigns either to the creating user, which means a
  // non-super-admin who creates a project there can't do anything with it
  // afterward (no admin role, so CollectionsController/ContentController/
  // etc. all 403) until someone else assigns it from the Laravel admin —
  // that reads as a legacy gap, not an intentional design, and it would
  // make "Use Template" (and honestly plain Create Project) fail
  // immediately for anyone but a super_admin. So this assigns the new
  // `admin{id}` role to the creating user right here. Role assignment for
  // anyone else stays exactly as out of scope as ever (see RolesService's
  // own comment) — this is only ever "grant the creator access to the
  // thing they just made," never general role management.
  //   - the legacy `type == 2` blog-template auto-seed (7 collections +
  //     fields) is intentionally NOT ported — you asked to omit it for now
  //   - `status` is new: legacy has no such column at all (see
  //     packages/db/sql/0001_add_project_status.sql). Defaults to 'live'.
  //   - `slug` is also new (see packages/db/sql/0002_add_project_slug.sql)
  //     — auto-derived from `name` if not supplied (matching Collections'
  //     own create-form convention), validated for shape and uniqueness,
  //     and immutable after creation (see `update`, which doesn't accept it).
  //
  // Authorization: JwtAuthGuard only (no ProjectRoleGuard) — legacy's
  // store() has no role check whatsoever, and you asked to match that
  // rather than tighten it, so any authenticated user can create a project
  // here too.
  async create(userId: number, input: CreateProjectInput) {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }
    if (name.length > 255) {
      throw new BadRequestException('name must be 255 characters or fewer');
    }
    if (INVALID_NAME_CHARS.test(name)) {
      throw new BadRequestException(
        'name contains a character that isn’t allowed (#$%^&*()+=-[]\';,/{}|":<>?~\\)',
      );
    }

    const defaultLocale = (input.defaultLocale ?? 'en').trim();
    if (!defaultLocale) {
      throw new BadRequestException('defaultLocale is required');
    }
    if (defaultLocale.length > 255) {
      throw new BadRequestException('defaultLocale must be 255 characters or fewer');
    }

    const status: ProjectStatus = PROJECT_STATUSES.includes(input.status as ProjectStatus)
      ? (input.status as ProjectStatus)
      : 'live';

    const description = input.description?.trim() || null;

    const rawSlug = (input.slug?.trim() || slugify(name)).slice(0, 80);
    if (!rawSlug || !SLUG_SHAPE.test(rawSlug)) {
      throw new BadRequestException(
        'slug must be lowercase letters, numbers, and single hyphens only',
      );
    }
    const existingSlug = await this.prisma.project.findFirst({ where: { slug: rawSlug } });
    if (existingSlug) {
      throw new ConflictException(`slug "${rawSlug}" is already in use`);
    }

    const project = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.project.create({
        data: {
          uuid: crypto.randomUUID(),
          name,
          slug: rawSlug,
          description,
          defaultLocale,
          locales: defaultLocale,
          disk: 'local',
          status,
        },
        select: PROJECT_LIST_SELECT,
      });

      const [adminRole] = await Promise.all([
        tx.role.create({ data: { name: `admin${created.id}`, guardName: 'web' } }),
        tx.role.create({ data: { name: `editor${created.id}`, guardName: 'web' } }),
      ]);

      await tx.modelHasRole.create({
        data: { roleId: adminRole.id, modelType: USER_MODEL_TYPE, modelId: userId },
      });

      return created;
    });

    return { ...project, collectionCount: 0, contentCount: 0 };
  }

  // Not a legacy endpoint — name/description edits and Live/Staging both
  // have no legacy equivalent as project-settings actions. Admin-tier,
  // same as every other schema/settings write in this codebase
  // (CollectionsController, ApiTokensController). `slug` is deliberately
  // not accepted here — it's set once at creation and immutable, same as
  // the Project Settings reference screen ("Slug cannot be changed").
  async update(id: number, input: UpdateProjectInput) {
    const project = await this.prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    const data: Prisma.ProjectUpdateInput = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw new BadRequestException('name is required');
      }
      if (name.length > 255) {
        throw new BadRequestException('name must be 255 characters or fewer');
      }
      if (INVALID_NAME_CHARS.test(name)) {
        throw new BadRequestException(
          'name contains a character that isn’t allowed (#$%^&*()+=-[]\';,/{}|":<>?~\\)',
        );
      }
      data.name = name;
    }

    if (input.description !== undefined) {
      data.description = input.description?.trim() || null;
    }

    if (input.status !== undefined) {
      if (!PROJECT_STATUSES.includes(input.status as ProjectStatus)) {
        throw new BadRequestException(`status must be one of: ${PROJECT_STATUSES.join(', ')}`);
      }
      data.status = input.status as ProjectStatus;
    }

    return this.prisma.project.update({
      where: { id },
      data,
      select: PROJECT_LIST_SELECT,
    });
  }

  // Ports the legacy delete(), which is super_admin-only (not admin{id} —
  // see require-project-role.decorator.ts's own audit of this) and:
  //   - hard-deletes collection_fields (no soft-delete concept for fields
  //     in legacy or here)
  //   - hard-force-deletes content and content_meta
  //   - deletes the admin{id}/editor{id} roles
  //   - hard-deletes the project row itself (legacy's Project model has no
  //     SoftDeletes trait at all)
  //
  // Several deliberate deviations, each because the legacy behavior is
  // either an outright gap or inconsistent with what this stack already
  // does elsewhere — see docs/PHASE-6-NOTES.md for the full reasoning:
  //   - The project itself is SOFT-deleted (deletedAt set), not
  //     hard-deleted — `projects.deleted_at` is this stack's own addition
  //     (packages/db/sql/0001_add_project_status.sql's sibling migration),
  //     and every read path already filters `deletedAt: null`, so this
  //     just uses the column the schema already has.
  //   - Collections are SOFT-deleted (matching how Collection.deletedAt
  //     already works everywhere else in this stack), not hard-deleted
  //     like legacy's schema-less Collection model does.
  //   - Content and content_meta are force-deleted WITHOUT the trashed-row
  //     exclusion legacy's `forceDelete()` has (both use SoftDeletes in
  //     legacy, so `$project->content()->forceDelete()` only reaches
  //     non-trashed rows by default, silently leaving already-trashed
  //     content behind forever) — this deletes all of it, trashed or not.
  //   - Media rows AND their actual stored files are deleted. Legacy's
  //     delete() never touches `media` at all — a real gap that leaves
  //     orphaned rows and orphaned files on disk/S3 forever.
  //   - This project's issued API tokens (`personal_access_tokens` with
  //     tokenableType = Project) are deleted too — legacy leaves these
  //     as dead rows as well.
  //   - `model_has_roles` rows for the deleted admin{id}/editor{id} roles
  //     are deleted explicitly, in the same transaction, before the Role
  //     rows themselves — legacy relies on a real `ON DELETE CASCADE`
  //     foreign key the actual legacy database has on that column
  //     (confirmed in its `create_permission_tables` migration), which
  //     isn't declared on this stack's own (hand-maintained, not
  //     `db pull`-synced) ModelHasRole.role relation — doing it explicitly
  //     is correct either way, and doesn't depend on that FK existing.
  async remove(id: number) {
    const project = await this.prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    // File deletion isn't transactional — do it before the DB transaction
    // so a failure here doesn't leave the DB rows gone but the files
    // behind (the safer failure mode is the reverse: files gone, a retry
    // of this same call finds no media rows left to worry about).
    const media = await this.prisma.media.findMany({ where: { projectId: id } });
    for (const item of media) {
      const provider = this.storage.for(item.disk);
      await provider.deleteOriginal(project.uuid, item.name);
      await provider.deleteThumbnail(project.uuid, item.name);
    }

    const roles = await this.prisma.role.findMany({
      where: { name: { in: [`admin${id}`, `editor${id}`] } },
    });
    const roleIds = roles.map((r: { id: number }) => r.id);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.contentMeta.deleteMany({ where: { projectId: id } });
      await tx.content.deleteMany({ where: { projectId: id } });
      await tx.media.deleteMany({ where: { projectId: id } });
      await tx.personalAccessToken.deleteMany({
        where: { tokenableType: PROJECT_TOKENABLE_TYPE, tokenableId: id },
      });
      await tx.collectionField.deleteMany({ where: { projectId: id } });
      await tx.collection.updateMany({
        where: { projectId: id, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      if (roleIds.length > 0) {
        await tx.modelHasRole.deleteMany({ where: { roleId: { in: roleIds } } });
        await tx.role.deleteMany({ where: { id: { in: roleIds } } });
      }

      return tx.project.update({
        where: { id },
        data: { deletedAt: new Date() },
        select: PROJECT_LIST_SELECT,
      });
    });
  }
}
