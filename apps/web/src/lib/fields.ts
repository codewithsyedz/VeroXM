// Field display helpers shared by the content-model screen.
//
// Everything here is derived from a field's real stored `type`, `options`
// and `validations` — the same JSON the public API and the content editor
// read. Nothing is inferred or defaulted into existence: a field with no
// validations simply produces a shorter descriptor.

import {
  AlignLeft,
  Braces,
  Calendar,
  Clock,
  Hash,
  Image as ImageIcon,
  Link2,
  List,
  ListChecks,
  Lock,
  Mail,
  ToggleLeft,
  Type,
  type LucideIcon,
} from "lucide-react";

export interface CharCountValidation {
  status: boolean;
  type: "Between" | "Min" | "Max" | "None";
  min?: number;
  max?: number;
}

export interface RequiredValidation {
  status: boolean;
  message?: string;
}

export interface UniqueValidation {
  status: boolean;
  message?: string;
}

// Conditional Logic — new, no legacy precedent (see docs/PHASE-6-NOTES.md).
// Stored as another freeform key inside a field's existing `options` JSON
// column, same as helpText/tooltip/etc above — no migration needed. One
// rule per field: "show (or hide) this field when <dependsOn> <operator>
// <value>". Evaluated by isFieldVisible() below, against whatever the form
// currently holds for every field.
export interface ConditionalLogicRule {
  enabled?: boolean;
  action: "show" | "hide";
  dependsOn: string; // another field's `name` in the same collection
  operator: "equals" | "not_equals" | "contains" | "is_empty" | "is_not_empty";
  value?: string;
}

// Field Groups — new, no legacy precedent. Group *definitions* live on the
// collection itself (Collection.options.fieldGroups, see CollectionOptions
// below); a field joins one by storing that group's id in its own
// options.fieldGroupId. Keeping the membership on the field (not a list on
// the group) means deleting a field never requires touching the group.
export interface FieldGroup {
  id: string;
  name: string;
}

export interface CollectionOptions {
  fieldGroups?: FieldGroup[];
  [key: string]: unknown;
}

export interface FieldInput {
  type: string;
  label: string;
  name: string;
  description?: string;
  placeholder?: string;
  options?: {
    enumeration?: string[];
    relation?: { collection?: number; type?: 1 | 2 };
    media?: { type?: 1 | 2 };
    hiddenInAPI?: boolean;
    // Advanced Configuration — freeform keys inside the existing `options`
    // JSON column, so none of these needed a migration.
    helpText?: string;
    defaultValue?: string;
    tooltip?: string;
    adminNotes?: string;
    conditionalLogic?: ConditionalLogicRule;
    fieldGroupId?: string;
    [key: string]: unknown;
  };
  validations?: {
    required?: RequiredValidation;
    unique?: UniqueValidation;
    charcount?: CharCountValidation;
    [key: string]: unknown;
  };
}

export interface FieldItem extends FieldInput {
  id: number;
  order: number | null;
}

export interface SiblingCollection {
  id: number;
  name: string;
  slug?: string;
}

// Evaluates one field's conditional-logic rule against the form's current
// values (keyed by field `name`, same shape ContentForm holds in state) and
// returns whether the field should be shown. A field with no rule (or a
// disabled one, or one whose `dependsOn` isn't a real field) is always
// visible — conditional logic can only hide fields that opted in.
export function isFieldVisible(field: FieldInput, values: Record<string, unknown>): boolean {
  const rule = field.options?.conditionalLogic;
  if (!rule || rule.enabled === false || !rule.dependsOn) return true;

  const raw = values[rule.dependsOn];
  const asText = (v: unknown) => (v == null ? "" : Array.isArray(v) ? v.join(",") : String(v));
  const text = asText(raw);
  const expected = rule.value ?? "";

  let matches: boolean;
  switch (rule.operator) {
    case "equals":
      matches = text === expected;
      break;
    case "not_equals":
      matches = text !== expected;
      break;
    case "contains":
      matches = text.toLowerCase().includes(expected.toLowerCase());
      break;
    case "is_empty":
      matches = text.trim() === "";
      break;
    case "is_not_empty":
      matches = text.trim() !== "";
      break;
    default:
      matches = true;
  }

  return rule.action === "show" ? matches : !matches;
}

export const TYPE_LABELS: Record<string, string> = {
  text: "Text",
  richtext: "Long Text",
  email: "Email",
  number: "Number",
  enumeration: "Enumeration",
  multi_enumeration: "Multi Enumeration",
  boolean: "Boolean",
  date: "Date",
  time: "Time",
  media: "Media Asset",
  relation: "Relation",
  json: "JSON",
  password: "Password",
};

export function typeLabel(type: string) {
  return TYPE_LABELS[type] ?? type;
}

// One line each, describing what the type actually stores/validates — the
// same wording used by the Add Field picker. Kept next to TYPE_LABELS so
// the two can't drift: every key in @mycms/shared-types' FIELD_TYPES has
// exactly one entry in each.
export const TYPE_DESCRIPTIONS: Record<string, string> = {
  text: "Single line text (headings, titles)",
  richtext: "Rich formatted text with a WYSIWYG editor",
  email: "Validated email address",
  number: "Integer, decimal, or float values",
  enumeration: "Single choice from a defined list of values",
  multi_enumeration: "Multiple choices from a defined list of values",
  boolean: "Yes or no, true or false",
  date: "Date, with a picker",
  time: "Time of day, with a picker",
  media: "Images, videos, or files",
  relation: "Reference to another collection's entry",
  json: "Structured JSON data",
  password: "Hashed, write-only password value",
};

export const TYPE_ICONS: Record<string, LucideIcon> = {
  text: Type,
  richtext: AlignLeft,
  email: Mail,
  number: Hash,
  enumeration: List,
  multi_enumeration: ListChecks,
  boolean: ToggleLeft,
  date: Calendar,
  time: Clock,
  media: ImageIcon,
  relation: Link2,
  json: Braces,
  password: Lock,
};

export function isRequired(field: FieldInput) {
  return !!field.validations?.required?.status;
}

// The descriptor line under a field's label, e.g.
// "title · Text · Required · Max 60 chars". Each segment is only added when
// the underlying value actually exists.
export function fieldDescriptors(field: FieldInput, siblings: SiblingCollection[] = []): string[] {
  const parts: string[] = [typeLabel(field.type)];

  if (isRequired(field)) parts.push("Required");
  if (field.validations?.unique?.status) parts.push("Unique");

  const charcount = field.validations?.charcount;
  const charUnit = field.type === "number" ? "" : " chars";
  if (charcount?.status) {
    if (charcount.type === "Between" && charcount.min != null && charcount.max != null) {
      parts.push(`${charcount.min}–${charcount.max}${charUnit}`);
    } else if (charcount.type === "Min" && charcount.min != null) {
      parts.push(`Min ${charcount.min}${charUnit}`);
    } else if (charcount.type === "Max" && charcount.max != null) {
      parts.push(`Max ${charcount.max}${charUnit}`);
    }
  }

  if (field.type === "enumeration" || field.type === "multi_enumeration") {
    const values = field.options?.enumeration ?? [];
    if (values.length) {
      const shown = values.slice(0, 3).join(", ");
      parts.push(values.length > 3 ? `${shown} +${values.length - 3}` : shown);
    }
  }

  if (field.type === "media") {
    parts.push(field.options?.media?.type === 1 ? "Single media" : "Multiple media");
  }

  if (field.type === "relation") {
    parts.push(field.options?.relation?.type === 1 ? "Single record" : "Many records");
    const related = siblings.find((s) => s.id === field.options?.relation?.collection);
    if (related) parts.push(`→ ${related.name}`);
  }

  if (field.options?.hiddenInAPI) parts.push("Hidden from API");

  return parts;
}

interface ContractEntry {
  type: string;
  required?: boolean;
  unique?: boolean;
  values?: string[];
  multiple?: boolean;
  relatedCollection?: string;
  minLength?: number;
  maxLength?: number;
}

// A machine-readable summary of what the public API returns for a
// collection, generated from the real field definitions. This is a
// projection of existing data, not a stored artifact — there's no schema
// versioning in this system, so it always reflects the fields as they are
// right now.
export function generateContract(
  collectionSlug: string,
  fields: FieldItem[],
  siblings: SiblingCollection[] = [],
) {
  const contractTypes: Record<string, string> = {
    text: "string",
    richtext: "string",
    email: "string",
    password: "string",
    number: "number",
    boolean: "boolean",
    date: "string",
    time: "string",
    json: "object",
    enumeration: "string",
    multi_enumeration: "string",
    media: "media",
    relation: "relation",
  };

  const properties: Record<string, ContractEntry> = {};

  for (const field of fields) {
    if (field.options?.hiddenInAPI) continue;

    const entry: ContractEntry = { type: contractTypes[field.type] ?? "string" };

    if (isRequired(field)) entry.required = true;
    if (field.validations?.unique?.status) entry.unique = true;

    const charcount = field.validations?.charcount;
    if (charcount?.status) {
      if (charcount.min != null && charcount.type !== "Max") entry.minLength = charcount.min;
      if (charcount.max != null && charcount.type !== "Min") entry.maxLength = charcount.max;
    }

    if (
      (field.type === "enumeration" || field.type === "multi_enumeration") &&
      field.options?.enumeration?.length
    ) {
      entry.values = field.options.enumeration;
    }

    if (field.type === "multi_enumeration") {
      entry.multiple = true;
    }

    if (field.type === "media") {
      entry.multiple = field.options?.media?.type !== 1;
    }

    if (field.type === "relation") {
      entry.multiple = field.options?.relation?.type !== 1;
      const related = siblings.find((s) => s.id === field.options?.relation?.collection);
      if (related?.slug) entry.relatedCollection = related.slug;
      else if (related) entry.relatedCollection = related.name;
    }

    properties[field.name] = entry;
  }

  return {
    collection: collectionSlug,
    fields: properties,
  };
}
