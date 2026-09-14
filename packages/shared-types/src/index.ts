// This package ships raw TypeScript with no build step (see package.json's
// "main": "src/index.ts") — apps/web's bundler transpiles it itself
// (next.config.ts's `transpilePackages`), and apps/api's Node runtime loads
// it directly via Node's built-in TypeScript support. Kept as one file
// (rather than index.ts re-exporting a sibling field-types.ts) on purpose:
// a relative import between two raw, never-compiled .ts files here has no
// single extension that's simultaneously valid for Next's bundler, tsc's
// nodenext resolution, and Node's own runtime resolver — this sidesteps
// that entirely, discovered when apps/api's container failed to boot
// against exactly that split (see docs/PHASE-2-NOTES.md for the same
// raw-TypeScript-at-runtime caveat, first surfaced for @mycms/db).

// Ported from collection_fields.type in the legacy schema.
// This is the single source of truth for the field-type registry consumed
// by both the NestJS validation layer and the Next.js FieldRenderer.

export const FIELD_TYPES = [
  "text",
  "richtext",
  "email",
  "number",
  "enumeration",
  "multi_enumeration",
  "boolean",
  "date",
  "time",
  "media",
  "relation",
  "json",
  "password",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export interface CharCountValidation {
  type: "Min" | "Max" | "Between" | "None";
  min?: number;
  max?: number;
}
