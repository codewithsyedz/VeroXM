import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '@mycms/db';
import { FIELD_TYPES } from '@mycms/shared-types';
import { RolesService } from '../authz/roles.service.js';

// Mirrors the legacy `collection_fields` shape for `options` and
// `validations` — both are native Json columns in Prisma (no manual
// json_decode needed, unlike the legacy PHP). Kept loose/untyped past the
// top level since the shape genuinely varies per field type.
export interface CharCountValidation {
  status?: boolean;
  type?: 'Between' | 'Min' | 'Max' | 'None';
  min?: number;
  max?: number;
}

export interface FieldValidations {
  charcount?: CharCountValidation;
  [key: string]: unknown;
}

export interface FieldOptions {
  enumeration?: unknown;
  relation?: { collection?: unknown };
  [key: string]: unknown;
}

export interface CollectionFieldInput {
  type?: string;
  label?: string;
  name?: string;
  description?: string;
  placeholder?: string;
  options?: FieldOptions;
  validations?: FieldValidations;
}

@Injectable()
export class CollectionFieldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
  ) {}

  private async loadCollectionOrThrow(projectId: number, collectionId: number) {
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, projectId, deletedAt: null },
    });
    if (!collection) {
      throw new NotFoundException(`Collection ${collectionId} not found in project ${projectId}`);
    }
    return collection;
  }

  // Replicates the legacy controllers' manual cross-field check on
  // `validations.charcount` — Laravel's rule engine covers everything
  // *except* this object's internal Between/Min/Max shape, which both
  // store() and update() re-validate by hand after the base rules pass.
  // Exact wording of the error messages is our own (the legacy messages
  // come from Laravel's default validator strings, not reproduced here) —
  // the validation *behavior* is what's being kept in parity.
  private validateCharCount(charcount: CharCountValidation | undefined, errors: Record<string, string[]>) {
    if (!charcount || !charcount.type) {
      errors['validations.charcount.type'] = ['The validations.charcount.type field is required.'];
      return;
    }

    if (!charcount.status) return; // charcount validation isn't enabled — nothing else to check

    if (charcount.type === 'Between') {
      const hasMin = charcount.min !== undefined && charcount.min !== null;
      const hasMax = charcount.max !== undefined && charcount.max !== null;
      if (!hasMin) errors['validations.charcount.min'] = ['The min field is required when type is Between.'];
      if (!hasMax) errors['validations.charcount.max'] = ['The max field is required when type is Between.'];
      if (hasMin && hasMax && charcount.min! > charcount.max!) {
        errors['validations.charcount.min'] = ['The min must be less than or equal to the max.'];
      }
    } else if (charcount.type === 'Min') {
      if (charcount.min === undefined || charcount.min === null) {
        errors['validations.charcount.min'] = ['The min field is required when type is Min.'];
      }
    } else if (charcount.type === 'Max') {
      if (charcount.max === undefined || charcount.max === null) {
        errors['validations.charcount.max'] = ['The max field is required when type is Max.'];
      }
    }
  }

  private async validate(
    projectId: number,
    collectionId: number,
    input: CollectionFieldInput,
    ignoreId?: number,
  ) {
    const errors: Record<string, string[]> = {};

    if (!input.label || !input.label.trim()) {
      errors.label = ['The label field is required.'];
    }

    if (!input.type || !(FIELD_TYPES as readonly string[]).includes(input.type)) {
      errors.type = [`The type field must be one of: ${FIELD_TYPES.join(', ')}.`];
    }

    if (!input.name || !input.name.trim()) {
      errors.name = ['The name field is required.'];
    } else {
      const clash = await this.prisma.collectionField.findFirst({
        where: {
          collectionId,
          name: input.name,
          ...(ignoreId ? { id: { not: ignoreId } } : {}),
        },
      });
      if (clash) {
        errors.name = ['This name is already in use in this collection.'];
      }
    }

    if (
      (input.type === 'enumeration' || input.type === 'multi_enumeration') &&
      !input.options?.enumeration
    ) {
      errors['options.enumeration'] = [
        'The options.enumeration field is required for enumeration/multi-enumeration fields.',
      ];
    }

    if (input.type === 'relation' && !input.options?.relation?.collection) {
      errors['options.relation.collection'] = [
        'The options.relation.collection field is required for relation fields.',
      ];
    }

    this.validateCharCount(input.validations?.charcount, errors);

    if (Object.keys(errors).length) {
      throw new BadRequestException({ message: 'Validation failed', errors });
    }
  }

  async create(projectId: number, collectionId: number, input: CollectionFieldInput) {
    await this.loadCollectionOrThrow(projectId, collectionId);
    await this.validate(projectId, collectionId, input);

    const created = await this.prisma.collectionField.create({
      data: {
        projectId,
        collectionId,
        type: input.type!,
        label: input.label!.trim(),
        name: input.name!.trim(),
        description: input.description ?? null,
        placeholder: input.placeholder ?? null,
        // Cast through Prisma's own JSON input type: FieldOptions/
        // FieldValidations are plain JSON-serializable interfaces (with a
        // permissive `[key: string]: unknown` index signature for
        // per-field-type variance), but TS won't structurally match a
        // named interface against Prisma's recursive InputJsonValue type
        // without an explicit cast — a real, if cosmetic, gap this
        // session's untyped Prisma stub never caught (see
        // docs/PHASE-2-NOTES.md) until `prisma generate` ran for real.
        options: (input.options ?? undefined) as Prisma.InputJsonValue | undefined,
        validations: (input.validations ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    // Mirrors the legacy store() — order defaults to the row's own id.
    return this.prisma.collectionField.update({
      where: { id: created.id },
      data: { order: created.id },
    });
  }

  async update(
    projectId: number,
    collectionId: number,
    fieldId: number,
    input: CollectionFieldInput,
  ) {
    await this.loadCollectionOrThrow(projectId, collectionId);
    const existing = await this.prisma.collectionField.findFirst({
      where: { id: fieldId, collectionId, projectId },
    });
    if (!existing) throw new NotFoundException(`Field ${fieldId} not found`);

    await this.validate(projectId, collectionId, input, fieldId);

    return this.prisma.collectionField.update({
      where: { id: fieldId },
      data: {
        type: input.type!,
        label: input.label!.trim(),
        name: input.name!.trim(),
        description: input.description ?? null,
        placeholder: input.placeholder ?? null,
        // Cast through Prisma's own JSON input type: FieldOptions/
        // FieldValidations are plain JSON-serializable interfaces (with a
        // permissive `[key: string]: unknown` index signature for
        // per-field-type variance), but TS won't structurally match a
        // named interface against Prisma's recursive InputJsonValue type
        // without an explicit cast — a real, if cosmetic, gap this
        // session's untyped Prisma stub never caught (see
        // docs/PHASE-2-NOTES.md) until `prisma generate` ran for real.
        options: (input.options ?? undefined) as Prisma.InputJsonValue | undefined,
        validations: (input.validations ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async remove(projectId: number, collectionId: number, fieldId: number) {
    await this.loadCollectionOrThrow(projectId, collectionId);
    const existing = await this.prisma.collectionField.findFirst({
      where: { id: fieldId, collectionId, projectId },
    });
    if (!existing) throw new NotFoundException(`Field ${fieldId} not found`);

    await this.prisma.collectionField.delete({ where: { id: fieldId } });
  }

  // Clone = duplicate within the SAME collection (see docs/PHASE-6-NOTES.md
  // — new, no legacy precedent). `name` has to stay unique per-collection
  // (validate() enforces this on every create), so the copy gets
  // "_copy", "_copy2", ... appended until one is free.
  private async uniqueFieldName(collectionId: number, baseName: string): Promise<string> {
    let candidate = `${baseName}_copy`;
    let suffix = 2;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const clash = await this.prisma.collectionField.findFirst({
        where: { collectionId, name: candidate },
      });
      if (!clash) return candidate;
      candidate = `${baseName}_copy${suffix}`;
      suffix += 1;
    }
  }

  async clone(projectId: number, collectionId: number, fieldId: number) {
    await this.loadCollectionOrThrow(projectId, collectionId);
    const source = await this.prisma.collectionField.findFirst({
      where: { id: fieldId, collectionId, projectId },
    });
    if (!source) throw new NotFoundException(`Field ${fieldId} not found`);

    const name = await this.uniqueFieldName(collectionId, source.name);
    const created = await this.prisma.collectionField.create({
      data: {
        projectId,
        collectionId,
        type: source.type,
        label: `${source.label} (Copy)`,
        name,
        description: source.description,
        placeholder: source.placeholder,
        options: (source.options ?? undefined) as Prisma.InputJsonValue | undefined,
        validations: (source.validations ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    return this.prisma.collectionField.update({
      where: { id: created.id },
      data: { order: created.id },
    });
  }

  // Fork = copy a single field's definition onto a DIFFERENT collection —
  // same project or another one (see docs/PHASE-6-NOTES.md). When the
  // target collection belongs to another project, this re-checks 'admin'
  // access against THAT project explicitly: the route's own
  // ProjectRoleGuard only ever checks the URL's :projectId (the source).
  async fork(
    projectId: number,
    collectionId: number,
    fieldId: number,
    targetCollectionId: number,
    actorUserId: number,
  ) {
    await this.loadCollectionOrThrow(projectId, collectionId);
    const source = await this.prisma.collectionField.findFirst({
      where: { id: fieldId, collectionId, projectId },
    });
    if (!source) throw new NotFoundException(`Field ${fieldId} not found`);

    const targetCollection = await this.prisma.collection.findFirst({
      where: { id: targetCollectionId, deletedAt: null },
    });
    if (!targetCollection) {
      throw new NotFoundException(`Collection ${targetCollectionId} not found`);
    }
    if (targetCollection.id === collectionId) {
      throw new BadRequestException(
        'Fork target must be a different collection — use Clone to duplicate within this collection.',
      );
    }

    if (targetCollection.projectId !== projectId) {
      const roles = await this.rolesService.getUserRoles(actorUserId);
      if (!this.rolesService.canAccess(roles, targetCollection.projectId, 'admin')) {
        throw new ForbiddenException(`Requires admin access to project ${targetCollection.projectId}`);
      }
    }

    const name = await this.uniqueFieldName(targetCollectionId, source.name);
    const clash = await this.prisma.collectionField.findFirst({
      where: { collectionId: targetCollectionId, name: source.name },
    });
    const created = await this.prisma.collectionField.create({
      data: {
        projectId: targetCollection.projectId,
        collectionId: targetCollectionId,
        type: source.type,
        label: source.label,
        // Only rename on an actual clash — forking into a fresh collection
        // usually shouldn't rename the field at all.
        name: clash ? name : source.name,
        description: source.description,
        placeholder: source.placeholder,
        options: (source.options ?? undefined) as Prisma.InputJsonValue | undefined,
        validations: (source.validations ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    return this.prisma.collectionField.update({
      where: { id: created.id },
      data: { order: created.id },
    });
  }

  async reorder(
    projectId: number,
    collectionId: number,
    items: Array<{ id: number; order: number }>,
  ) {
    await this.loadCollectionOrThrow(projectId, collectionId);

    // Matches the legacy fields updateOrder(): ids that don't resolve to a
    // field in this collection are silently skipped rather than throwing —
    // unlike Collections' own reorder(), which rejects the whole batch.
    // updateMany's where-scoped match makes that "skip if not found"
    // behavior automatic: a non-matching id just updates zero rows.
    await Promise.all(
      items.map((item) =>
        this.prisma.collectionField.updateMany({
          where: { id: item.id, collectionId, projectId },
          data: { order: item.order },
        }),
      ),
    );
  }
}
