import * as bcrypt from 'bcryptjs';

// Shared between the admin ContentService (Phase 4) and the public API's
// write endpoints (Phase 5) — both need the exact same per-field-type
// encode/decode and validation behavior the legacy app applies in
// ContentController::store/update (admin) and API\ContentController::
// create/update (public), so this is factored out once rather than
// drifting into two slightly-different copies.

export interface RequiredValidation {
  status?: boolean;
  message?: string;
}
export interface UniqueValidation {
  status?: boolean;
  message?: string;
}
export interface CharCountValidation {
  status?: boolean;
  type?: 'Between' | 'Min' | 'Max';
  min?: number;
  max?: number;
}
export interface FieldValidations {
  required?: RequiredValidation;
  unique?: UniqueValidation;
  charcount?: CharCountValidation;
}

export interface FieldRow {
  id: number;
  type: string;
  name: string;
  label?: string;
  options?: unknown;
  validations: FieldValidations | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Approximates PHP's empty() for the values these forms submit — the
// legacy store()/update() (both admin and public) skip writing a meta row
// for anything empty() treats as absent.
export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '' || value === false) return true;
  if (typeof value === 'number' && value === 0) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

export function decodeFieldValue(field: FieldRow, stored: string | null | undefined): unknown {
  if (stored === null || stored === undefined) return field.type === 'boolean' ? false : '';

  switch (field.type) {
    case 'password':
      return '';
    case 'media':
    case 'relation':
      return stored === '' ? [] : stored.split(',').map((s) => Number(s));
    case 'multi_enumeration':
      return stored === '' ? [] : stored.split(',');
    case 'json':
      try {
        return stored ? JSON.parse(stored) : null;
      } catch {
        return null;
      }
    case 'boolean':
      return stored === '1' || stored === 'true';
    default:
      return stored;
  }
}

export async function encodeFieldValue(
  field: FieldRow,
  rawValue: unknown,
  existingValue: string | null | undefined,
): Promise<string> {
  switch (field.type) {
    case 'password':
      if (isEmptyValue(rawValue)) return existingValue ?? '';
      return bcrypt.hash(String(rawValue), 10);
    case 'media':
    case 'relation':
      return Array.isArray(rawValue) ? rawValue.join(',') : String(rawValue ?? '');
    case 'multi_enumeration':
      return Array.isArray(rawValue) ? rawValue.join(',') : String(rawValue ?? '');
    case 'json':
      return JSON.stringify(rawValue ?? null);
    default:
      return rawValue === null || rawValue === undefined ? '' : String(rawValue);
  }
}

export interface UniqueChecker {
  (fieldName: string, value: string, ignoreContentId?: number): Promise<boolean>; // true = clash exists
}

// `keyPrefix` lets callers match their own error-key convention — the admin
// API reports errors as `data.<field>` (values nested under a `data` key),
// the public API reports them as bare `<field>` (values sent flat) —
// matching each legacy controller's own Validator rule keys exactly.
export async function validateContentData(
  fields: FieldRow[],
  data: Record<string, unknown>,
  checkUnique: UniqueChecker,
  keyPrefix: string,
  options?: { partial?: boolean },
): Promise<Record<string, string[]> | null> {
  const errors: Record<string, string[]> = {};
  const partial = options?.partial ?? false;

  for (const field of fields) {
    const validations = field.validations ?? {};
    const value = data[field.name];
    const key = `${keyPrefix}${field.name}`;

    // In partial mode (a PATCH body), a field the caller's body never
    // mentions at all isn't being changed, so it shouldn't trip
    // "required" — that would force every partial update to resend the
    // whole record just to change one field. A field explicitly sent as
    // empty/null still fails required, in both modes — `omitted` only
    // covers the key being absent, not present-and-empty.
    const omitted = partial && !(field.name in data);

    if (!omitted && validations.required?.status && isEmptyValue(value)) {
      errors[key] = [validations.required.message || `The ${field.name} field is required.`];
      continue;
    }

    if (isEmptyValue(value)) continue;

    if (field.type === 'email' && typeof value === 'string' && !EMAIL_RE.test(value)) {
      errors[key] = [`The ${field.name} must be a valid email address.`];
    }

    if (field.type === 'number' && Number.isNaN(Number(value))) {
      errors[key] = [...(errors[key] ?? []), `The ${field.name} must be numeric.`];
    }

    const cc = validations.charcount;
    if (cc?.status) {
      const len = field.type === 'number' ? Number(value) : String(value).length;
      const unit = field.type === 'number' ? '' : ' characters';
      if (cc.type === 'Between' && cc.min !== undefined && cc.max !== undefined) {
        if (len < cc.min || len > cc.max) {
          errors[key] = [
            ...(errors[key] ?? []),
            `The ${field.name} must be between ${cc.min} and ${cc.max}${unit}.`,
          ];
        }
      } else if (cc.type === 'Min' && cc.min !== undefined && len < cc.min) {
        errors[key] = [...(errors[key] ?? []), `The ${field.name} must be at least ${cc.min}${unit}.`];
      } else if (cc.type === 'Max' && cc.max !== undefined && len > cc.max) {
        errors[key] = [...(errors[key] ?? []), `The ${field.name} may not be greater than ${cc.max}${unit}.`];
      }
    }

    if (validations.unique?.status) {
      const clash = await checkUnique(field.name, String(value));
      if (clash) {
        errors[key] = [validations.unique.message || `The ${field.name} has already been taken.`];
      }
    }
  }

  return Object.keys(errors).length ? errors : null;
}
