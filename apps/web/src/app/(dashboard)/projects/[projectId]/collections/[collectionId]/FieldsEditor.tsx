"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { FIELD_TYPES, type FieldType } from "@mycms/shared-types";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  GitFork,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
  Type,
  Workflow,
  X,
} from "lucide-react";
import {
  fieldDescriptors,
  isRequired,
  TYPE_DESCRIPTIONS,
  TYPE_ICONS,
  typeLabel,
  type CharCountValidation,
  type ConditionalLogicRule,
  type FieldGroup,
  type FieldInput,
  type FieldItem,
  type RequiredValidation,
  type SiblingCollection,
  type UniqueValidation,
} from "@/lib/fields";
import {
  cloneField,
  createField,
  deleteField,
  forkField,
  reorderFields,
  updateCollectionMeta,
  updateField,
} from "./actions";

// Re-exported so the pages that render this component keep importing their
// types from one place, as they did before these moved to @/lib/fields
// (which the read-only contract generator also needs).
export type {
  CharCountValidation,
  FieldGroup,
  FieldInput,
  FieldItem,
  RequiredValidation,
  SiblingCollection,
  UniqueValidation,
};

const EMPTY_CHARCOUNT: CharCountValidation = { status: false, type: "None" };
const EMPTY_REQUIRED: RequiredValidation = { status: false };
const EMPTY_UNIQUE: UniqueValidation = { status: false };

function toFormState(field?: FieldItem): FieldInput {
  return {
    type: field?.type ?? FIELD_TYPES[0],
    label: field?.label ?? "",
    name: field?.name ?? "",
    description: field?.description ?? "",
    placeholder: field?.placeholder ?? "",
    options: field?.options ?? {},
    validations: field?.validations ?? {
      required: EMPTY_REQUIRED,
      unique: EMPTY_UNIQUE,
      charcount: EMPTY_CHARCOUNT,
    },
  };
}

// Derives a camelCase API field name from a human label, e.g.
// "Publish Date" -> "publishDate". Only runs until the user edits the
// Field Name directly (see the `nameTouched` state in FieldForm) — the
// same touched-override pattern used for slugs elsewhere in this app.
function toFieldName(label: string): string {
  const words = label
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  return words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join("");
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-[#b8bfd8]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-[#4531e0]"
      />
      {label}
    </label>
  );
}

function FieldForm({
  initial,
  siblings,
  groups,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FieldInput;
  siblings: SiblingCollection[];
  groups: FieldGroup[];
  submitLabel: string;
  onSubmit: (input: FieldInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FieldInput>(initial);
  const [nameTouched, setNameTouched] = useState(!!initial.name);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const charcount = form.validations?.charcount ?? EMPTY_CHARCOUNT;
  const required = form.validations?.required ?? EMPTY_REQUIRED;
  const unique = form.validations?.unique ?? EMPTY_UNIQUE;

  function setCharcount(patch: Partial<CharCountValidation>) {
    setForm((f) => ({
      ...f,
      validations: { ...f.validations, charcount: { ...charcount, ...patch } },
    }));
  }

  function setRequired(patch: Partial<RequiredValidation>) {
    setForm((f) => ({
      ...f,
      validations: { ...f.validations, required: { ...required, ...patch } },
    }));
  }

  function setUnique(patch: Partial<UniqueValidation>) {
    setForm((f) => ({
      ...f,
      validations: { ...f.validations, unique: { ...unique, ...patch } },
    }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await onSubmit(form);
        onCancel?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save field");
      }
    });
  }

  const HeaderIcon = TYPE_ICONS[form.type] ?? Type;

  return (
    <div className="surface-inset flex flex-col gap-4 rounded-xl p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-[#7680a3]">
          <HeaderIcon className="h-4 w-4" aria-hidden="true" />
        </span>
        <h3 className="text-sm font-medium text-[#f2f3fb]">
          {submitLabel === "Add field" ? "Add" : "Edit"} {typeLabel(form.type)} Field
        </h3>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <select
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as FieldType }))}
          className="input-quiet h-10 px-3 text-sm"
          aria-label="Field type"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t} className="bg-[#0b0c22]">
              {typeLabel(t)}
            </option>
          ))}
        </select>
        <input
          value={form.label}
          onChange={(e) => {
            const label = e.target.value;
            setForm((f) => ({
              ...f,
              label,
              name: nameTouched ? f.name : toFieldName(label),
            }));
          }}
          placeholder="Label"
          className="input-quiet h-10 px-3 text-sm"
        />
        <input
          value={form.name}
          onChange={(e) => {
            setNameTouched(true);
            setForm((f) => ({ ...f, name: e.target.value }));
          }}
          placeholder="apiName (auto-generated from Label)"
          className="input-quiet h-10 px-3 font-mono-code text-xs"
        />
      </div>

      <textarea
        value={form.description ?? ""}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        placeholder="Description (optional)"
        rows={2}
        className="input-quiet px-3 py-2 text-sm"
      />

      {(form.type === "enumeration" || form.type === "multi_enumeration") && (
        <div>
          <label className="mb-1.5 block text-xs text-[#7680a3]">
            {form.type === "multi_enumeration"
              ? "Values (one per line) — content editors can select more than one"
              : "Enumeration values (one per line)"}
          </label>
          <textarea
            value={(form.options?.enumeration ?? []).join("\n")}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                options: {
                  ...f.options,
                  enumeration: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean),
                },
              }))
            }
            rows={3}
            className="input-quiet px-3 py-2 font-mono-code text-xs"
          />
        </div>
      )}

      {form.type === "relation" && (
        <div className="flex flex-col gap-2">
          <label className="block text-xs text-[#7680a3]">Related collection</label>
          <select
            value={form.options?.relation?.collection ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                options: {
                  ...f.options,
                  relation: { ...f.options?.relation, collection: Number(e.target.value) },
                },
              }))
            }
            className="input-quiet h-10 max-w-xs px-3 text-sm"
          >
            <option value="" className="bg-[#0b0c22]">
              Select a collection…
            </option>
            {siblings.map((s) => (
              <option key={s.id} value={s.id} className="bg-[#0b0c22]">
                {s.name}
              </option>
            ))}
          </select>
          <Toggle
            checked={form.options?.relation?.type === 1}
            onChange={(checked) =>
              setForm((f) => ({
                ...f,
                options: {
                  ...f.options,
                  relation: { ...f.options?.relation, type: checked ? 1 : 2 },
                },
              }))
            }
            label="Single related record (unchecked = many)"
          />
        </div>
      )}

      {form.type === "media" && (
        <Toggle
          checked={form.options?.media?.type === 1}
          onChange={(checked) =>
            setForm((f) => ({
              ...f,
              options: { ...f.options, media: { type: checked ? 1 : 2 } },
            }))
          }
          label="Single file (unchecked = many)"
        />
      )}

      <Toggle
        checked={!!form.options?.hiddenInAPI}
        onChange={(checked) =>
          setForm((f) => ({ ...f, options: { ...f.options, hiddenInAPI: checked } }))
        }
        label="Hide from public API"
      />

      <div className="rounded-lg border border-dashed border-white/[0.10] p-4">
        <p className="mb-3 text-xs font-medium text-[#b8bfd8]">Basic Validation</p>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <div>
            <Toggle
              checked={required.status}
              onChange={(checked) => setRequired({ status: checked })}
              label="Required"
            />
            {required.status && (
              <input
                value={required.message ?? ""}
                onChange={(e) => setRequired({ message: e.target.value })}
                placeholder="Custom message (optional)"
                className="input-quiet mt-2 h-9 w-56 px-3 text-xs"
              />
            )}
          </div>

          <div>
            <Toggle
              checked={unique.status}
              onChange={(checked) => setUnique({ status: checked })}
              label="Unique"
            />
            {unique.status && (
              <input
                value={unique.message ?? ""}
                onChange={(e) => setUnique({ message: e.target.value })}
                placeholder="Custom message (optional)"
                className="input-quiet mt-2 h-9 w-56 px-3 text-xs"
              />
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-white/[0.10] p-4">
        <p className="mb-3 text-xs font-medium text-[#b8bfd8]">Advanced Configuration</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={form.placeholder ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, placeholder: e.target.value }))}
            placeholder="Placeholder text"
            className="input-quiet h-10 px-3 text-sm"
          />
          <input
            value={form.options?.helpText ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, options: { ...f.options, helpText: e.target.value } }))
            }
            placeholder="Help text (shown under the field)"
            className="input-quiet h-10 px-3 text-sm"
          />
          <input
            value={form.options?.defaultValue ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, options: { ...f.options, defaultValue: e.target.value } }))
            }
            placeholder="Default value"
            className="input-quiet h-10 px-3 text-sm"
          />
          <input
            value={form.options?.tooltip ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, options: { ...f.options, tooltip: e.target.value } }))
            }
            placeholder="Tooltip"
            className="input-quiet h-10 px-3 text-sm"
          />
          {groups.length > 0 && (
            <select
              value={form.options?.fieldGroupId ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  options: { ...f.options, fieldGroupId: e.target.value || undefined },
                }))
              }
              className="input-quiet h-10 px-3 text-sm"
              aria-label="Field group"
            >
              <option value="" className="bg-[#0b0c22]">
                No group
              </option>
              {groups.map((g) => (
                <option key={g.id} value={g.id} className="bg-[#0b0c22]">
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <textarea
          value={form.options?.adminNotes ?? ""}
          onChange={(e) =>
            setForm((f) => ({ ...f, options: { ...f.options, adminNotes: e.target.value } }))
          }
          placeholder="Admin notes (internal — never shown to content editors or the public API)"
          rows={2}
          className="input-quiet mt-3 px-3 py-2 text-xs"
        />
      </div>

      {(form.type === "text" || form.type === "richtext" || form.type === "number") && (
        <div className="rounded-lg border border-dashed border-white/[0.10] p-4">
          <p className="mb-3 text-xs font-medium text-[#b8bfd8]">
            {form.type === "number" ? "Value Range Validation" : "Length Validation"}
          </p>
          <select
            value={charcount.status ? charcount.type : "None"}
            onChange={(e) => {
              const value = e.target.value as CharCountValidation["type"];
              setCharcount(
                value === "None" ? { status: false, type: "None" } : { status: true, type: value },
              );
            }}
            className="input-quiet h-9 w-56 px-3 text-xs"
            aria-label={form.type === "number" ? "Value range rule" : "Character count rule"}
          >
            <option value="None" className="bg-[#0b0c22]">
              No {form.type === "number" ? "range" : "length"} validation
            </option>
            <option value="Min" className="bg-[#0b0c22]">
              Minimum {form.type === "number" ? "value" : "length"}
            </option>
            <option value="Max" className="bg-[#0b0c22]">
              Maximum {form.type === "number" ? "value" : "length"}
            </option>
            <option value="Between" className="bg-[#0b0c22]">
              Between min and max
            </option>
          </select>
          {charcount.status && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {(charcount.type === "Between" || charcount.type === "Min") && (
                <input
                  type="number"
                  value={charcount.min ?? ""}
                  onChange={(e) =>
                    setCharcount({ min: e.target.value ? Number(e.target.value) : undefined })
                  }
                  placeholder="Min"
                  className="input-quiet h-9 w-24 px-3 text-xs"
                />
              )}
              {(charcount.type === "Between" || charcount.type === "Max") && (
                <input
                  type="number"
                  value={charcount.max ?? ""}
                  onChange={(e) =>
                    setCharcount({ max: e.target.value ? Number(e.target.value) : undefined })
                  }
                  placeholder="Max"
                  className="input-quiet h-9 w-24 px-3 text-xs"
                />
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !form.label.trim() || !form.name.trim()}
          className="button-primary px-4"
        >
          {isPending ? "Working…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="button-secondary px-4">
            Cancel
          </button>
        )}
      </div>
      {error && <p className="text-xs text-[#ea6d76]">{error}</p>}
    </div>
  );
}

function ConditionalLogicModal({
  fields,
  initialFieldId,
  onClose,
  onSave,
}: {
  fields: FieldItem[];
  initialFieldId?: number;
  onClose: () => void;
  onSave: (fieldId: number, rule: ConditionalLogicRule | null) => Promise<void>;
}) {
  const [fieldId, setFieldId] = useState<number | undefined>(initialFieldId ?? fields[0]?.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configure Conditional Logic"
        className="surface-standard w-full max-w-lg rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-[#f2f3fb]">Configure Conditional Logic</h2>
            <p className="mt-1 text-sm text-[#b8bfd8]">
              Show or hide this field in the content editor based on another field&apos;s value.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-button h-8 w-8 shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5">
          <label className="mb-1.5 block text-xs text-[#7680a3]">Field</label>
          <select
            value={fieldId ?? ""}
            onChange={(e) => setFieldId(Number(e.target.value))}
            className="input-quiet h-10 w-full px-3 text-sm"
          >
            {fields.map((f) => (
              <option key={f.id} value={f.id} className="bg-[#0b0c22]">
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {/* Keyed by fieldId so switching the selected field remounts this
            form fresh (each field's own existing rule, if any, seeds its
            state via plain useState initializers) instead of needing an
            effect to reset state after the fact. */}
        {fieldId !== undefined && (
          <ConditionalLogicFields
            key={fieldId}
            field={fields.find((f) => f.id === fieldId)!}
            otherFields={fields.filter((f) => f.id !== fieldId)}
            onCancel={onClose}
            onSave={(rule) => onSave(fieldId, rule)}
          />
        )}
      </div>
    </div>
  );
}

function ConditionalLogicFields({
  field,
  otherFields,
  onCancel,
  onSave,
}: {
  field: FieldItem;
  otherFields: FieldItem[];
  onCancel: () => void;
  onSave: (rule: ConditionalLogicRule | null) => Promise<void>;
}) {
  const existing = field.options?.conditionalLogic;
  const [enabled, setEnabled] = useState(!!existing);
  const [action, setAction] = useState<ConditionalLogicRule["action"]>(existing?.action ?? "show");
  const [dependsOn, setDependsOn] = useState(existing?.dependsOn ?? "");
  const [operator, setOperator] = useState<ConditionalLogicRule["operator"]>(
    existing?.operator ?? "equals",
  );
  const [value, setValue] = useState(existing?.value ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const needsValue = operator === "equals" || operator === "not_equals" || operator === "contains";

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await onSave(
          enabled && dependsOn
            ? { enabled: true, action, dependsOn, operator, value: needsValue ? value : undefined }
            : null,
        );
        onCancel();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save conditional logic");
      }
    });
  }

  return (
    <>
      <div className="mt-4 flex flex-col gap-4">
        <Toggle
          checked={enabled}
          onChange={setEnabled}
          label="Enable conditional logic for this field"
        />

        {enabled && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as ConditionalLogicRule["action"])}
                className="input-quiet h-10 px-3 text-sm"
                aria-label="Action"
              >
                <option value="show" className="bg-[#0b0c22]">
                  Show this field when…
                </option>
                <option value="hide" className="bg-[#0b0c22]">
                  Hide this field when…
                </option>
              </select>
              <select
                value={dependsOn}
                onChange={(e) => setDependsOn(e.target.value)}
                className="input-quiet h-10 px-3 text-sm"
                aria-label="Depends on field"
              >
                <option value="" className="bg-[#0b0c22]">
                  Depends on field…
                </option>
                {otherFields.map((f) => (
                  <option key={f.id} value={f.name} className="bg-[#0b0c22]">
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={operator}
                onChange={(e) => setOperator(e.target.value as ConditionalLogicRule["operator"])}
                className="input-quiet h-10 px-3 text-sm"
                aria-label="Operator"
              >
                <option value="equals" className="bg-[#0b0c22]">
                  Equals
                </option>
                <option value="not_equals" className="bg-[#0b0c22]">
                  Does not equal
                </option>
                <option value="contains" className="bg-[#0b0c22]">
                  Contains
                </option>
                <option value="is_empty" className="bg-[#0b0c22]">
                  Is empty
                </option>
                <option value="is_not_empty" className="bg-[#0b0c22]">
                  Is not empty
                </option>
              </select>
              {needsValue && (
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Value"
                  className="input-quiet h-10 px-3 text-sm"
                />
              )}
            </div>
          </>
        )}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={isPending || (enabled && !dependsOn)}
          className="button-primary px-4"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="button-secondary px-4">
          Cancel
        </button>
      </div>
      {error && <p className="mt-3 text-xs text-[#ea6d76]">{error}</p>}
    </>
  );
}

// Fork-field UI is deliberately scoped to same-project sibling collections
// only — the backend (collection-fields.service.ts's fork()) also accepts a
// different project's collection and re-checks admin access there, but
// picking a collection in a project the current user hasn't loaded fields
// for yet has no UI here. Cross-project forking is possible via the API,
// just not from this picker (see docs/PHASE-6-NOTES.md).
function ForkFieldModal({
  item,
  siblings,
  onClose,
  onFork,
}: {
  item: FieldItem;
  siblings: SiblingCollection[];
  onClose: () => void;
  onFork: (targetCollectionId: number) => Promise<void>;
}) {
  const [targetId, setTargetId] = useState<number | undefined>(siblings[0]?.id);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!targetId) return;
    setError(null);
    startTransition(async () => {
      try {
        await onFork(targetId);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fork field");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Fork Field"
        className="surface-standard w-full max-w-sm rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-medium text-[#f2f3fb]">Fork &quot;{item.label}&quot;</h2>
        <p className="mt-1 text-sm text-[#b8bfd8]">
          Copy this field&apos;s definition onto another collection in this project.
        </p>

        {siblings.length === 0 ? (
          <p className="mt-4 text-sm text-[#b8bfd8]">
            No other collections in this project to fork into.
          </p>
        ) : (
          <select
            value={targetId ?? ""}
            onChange={(e) => setTargetId(Number(e.target.value))}
            className="input-quiet mt-4 h-10 w-full px-3 text-sm"
          >
            {siblings.map((s) => (
              <option key={s.id} value={s.id} className="bg-[#0b0c22]">
                {s.name}
              </option>
            ))}
          </select>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !targetId}
            className="button-primary px-4"
          >
            {isPending ? "Forking…" : "Fork field"}
          </button>
          <button type="button" onClick={onClose} className="button-secondary px-4">
            Cancel
          </button>
        </div>
        {error && <p className="mt-3 text-xs text-[#ea6d76]">{error}</p>}
      </div>
    </div>
  );
}

function FieldRow({
  projectId,
  collectionId,
  item,
  siblings,
  groups,
  isFirst,
  isLast,
  onMove,
  onConfigureLogic,
}: {
  projectId: string;
  collectionId: string;
  item: FieldItem;
  siblings: SiblingCollection[];
  groups: FieldGroup[];
  isFirst: boolean;
  isLast: boolean;
  onMove: (id: number, direction: "up" | "down") => void;
  onConfigureLogic: (item: FieldItem) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [forking, setForking] = useState(false);
  const [isPending, startTransition] = useTransition();

  function remove() {
    startTransition(() => deleteField(projectId, collectionId, item.id));
  }

  function clone() {
    startTransition(() => cloneField(projectId, collectionId, item.id));
  }

  if (editing) {
    return (
      <FieldForm
        initial={toFormState(item)}
        siblings={siblings}
        groups={groups}
        submitLabel="Save"
        onCancel={() => setEditing(false)}
        onSubmit={(input) => updateField(projectId, collectionId, item.id, input)}
      />
    );
  }

  const Icon = TYPE_ICONS[item.type] ?? Type;
  const descriptors = fieldDescriptors(item, siblings);
  const hasConditionalLogic = !!item.options?.conditionalLogic?.enabled;

  return (
    <div className="group flex items-center gap-4 border-b border-white/[0.05] px-4 py-3.5 last:border-b-0 hover:bg-white/[0.02]">
      {forking && (
        <ForkFieldModal
          item={item}
          siblings={siblings}
          onClose={() => setForking(false)}
          onFork={(targetCollectionId) => forkField(projectId, collectionId, item.id, targetCollectionId)}
        />
      )}

      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-[#7680a3]">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[#f2f3fb]">{item.label}</span>
          {isRequired(item) && (
            <span className="rounded border border-[rgba(77,163,255,0.25)] bg-[rgba(69,49,224,0.14)] px-1.5 py-0.5 font-mono-code text-[10px] text-[#4da3ff]">
              Required
            </span>
          )}
          {hasConditionalLogic && (
            <span
              className="inline-flex items-center gap-1 rounded border border-[rgba(200,160,255,0.25)] bg-[rgba(140,90,224,0.14)] px-1.5 py-0.5 font-mono-code text-[10px] text-[#c8a0ff]"
              title="Conditional logic configured"
            >
              <Workflow className="h-2.5 w-2.5" aria-hidden="true" />
              Conditional
            </span>
          )}
        </div>
        <p className="mt-1 truncate font-mono-code text-[11px] text-[#7680a3]">
          <span className="text-[#8f9bc9]">{item.name}</span>
          {descriptors.length > 0 && <span> · {descriptors.join(" · ")}</span>}
        </p>
        {item.options?.adminNotes && (
          <p className="mt-1 truncate text-[11px] italic text-[#7680a3]">
            Note: {item.options.adminNotes}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
        <div className="flex flex-col">
          <button
            type="button"
            disabled={isFirst || isPending}
            onClick={() => onMove(item.id, "up")}
            className="icon-button h-6 w-6"
            aria-label={`Move ${item.label} up`}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={isLast || isPending}
            onClick={() => onMove(item.id, "down")}
            className="icon-button h-6 w-6"
            aria-label={`Move ${item.label} down`}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => onConfigureLogic(item)}
          className="icon-button"
          aria-label={`Configure conditional logic for ${item.label}`}
          title="Configure conditional logic"
        >
          <Workflow className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={clone}
          disabled={isPending}
          className="icon-button"
          aria-label={`Clone ${item.label}`}
          title="Clone field (within this collection)"
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setForking(true)}
          className="icon-button"
          aria-label={`Fork ${item.label}`}
          title="Fork field (to another collection)"
        >
          <GitFork className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="icon-button"
          aria-label={`Edit ${item.label}`}
          title="Edit field"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          className="icon-button text-[#ea6d76] disabled:text-[#7680a3]"
          aria-label={`Delete ${item.label}`}
          title="Delete field"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// The type picker shown before a field's actual form — matches the
// reference design's "Add Field" modal. Reads straight off
// @mycms/shared-types' FIELD_TYPES, so `time` and `multi_enumeration` show
// up here automatically once that package (and the Prisma client) is
// regenerated. Plain `longtext` and `slug` remain unported — see
// docs/PHASE-6-NOTES.md for why (they have real legacy precedent but
// weren't part of this request).
function AddFieldTypeModal({
  onSelect,
  onClose,
}: {
  onSelect: (type: FieldType) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add Field"
        className="surface-standard w-full max-w-2xl rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-[#f2f3fb]">Add Field</h2>
            <p className="mt-1 text-sm text-[#b8bfd8]">Select a field type to add</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-button h-8 w-8 shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {FIELD_TYPES.map((t) => {
            const Icon = TYPE_ICONS[t] ?? Type;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onSelect(t)}
                className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-left transition-colors hover:border-white/[0.16] hover:bg-white/[0.05]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-[#7680a3]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[#f2f3fb]">{typeLabel(t)}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[#7680a3]">
                    {TYPE_DESCRIPTIONS[t] ?? ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Field Groups management — a small inline panel, not a modal, since it's
// used rarely and doesn't need to block the rest of the screen. Persists by
// replacing the collection's ENTIRE `options` column (see
// collections.service.ts's update() comment on why a partial JSON merge
// isn't supported there yet) — safe today since fieldGroups is the only key
// this app ever writes into a collection's options.
function GroupsManager({
  groups,
  onChange,
}: {
  groups: FieldGroup[];
  onChange: (groups: FieldGroup[]) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = [...groups, { id: crypto.randomUUID(), name: trimmed }];
    setError(null);
    startTransition(async () => {
      try {
        await onChange(next);
        setName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save group");
      }
    });
  }

  function remove(id: string) {
    const next = groups.filter((g) => g.id !== id);
    startTransition(async () => {
      try {
        await onChange(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to remove group");
      }
    });
  }

  return (
    <div className="border-b border-white/[0.07] bg-white/[0.02] px-5 py-4">
      <p className="mb-3 text-xs font-medium text-[#b8bfd8]">
        Field Groups — organize fields under named headers below
      </p>
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <span
            key={g.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.03] py-1 pl-3 pr-1.5 text-xs text-[#b8bfd8]"
          >
            {g.name}
            <button
              type="button"
              onClick={() => remove(g.id)}
              disabled={isPending}
              className="icon-button h-5 w-5"
              aria-label={`Remove group ${g.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <div className="inline-flex items-center gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="New group name"
            className="input-quiet h-8 w-40 px-2.5 text-xs"
          />
          <button
            type="button"
            onClick={add}
            disabled={isPending || !name.trim()}
            className="button-secondary h-8 px-2.5 text-xs"
          >
            Add
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-[#ea6d76]">{error}</p>}
    </div>
  );
}

const UNGROUPED = "__ungrouped__";

export default function FieldsEditor({
  projectId,
  collectionId,
  initialFields,
  initialOptions,
  siblings,
}: {
  projectId: string;
  collectionId: string;
  initialFields: FieldItem[];
  initialOptions?: { fieldGroups?: FieldGroup[] } | null;
  siblings: SiblingCollection[];
}) {
  const [items, setItems] = useState(
    [...initialFields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  );
  const [groups, setGroups] = useState<FieldGroup[]>(initialOptions?.fieldGroups ?? []);
  const [adding, setAdding] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newFieldType, setNewFieldType] = useState<FieldType>(FIELD_TYPES[0]);
  const [showGroupsManager, setShowGroupsManager] = useState(false);
  const [logicField, setLogicField] = useState<FieldItem | null>(null);
  const [, startReorderTransition] = useTransition();

  // Filters — client-side only, over whatever fields/groups already loaded.
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [groupFilter, setGroupFilter] = useState<string>("");

  function move(id: number, direction: "up" | "down") {
    const index = items.findIndex((f) => f.id === id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= items.length) return;

    const next = [...items];
    [next[index], next[swapWith]] = [next[swapWith], next[index]];
    setItems(next);

    const reordered = next.map((f, i) => ({ id: f.id, order: i + 1 }));
    startReorderTransition(() => reorderFields(projectId, collectionId, reordered));
  }

  async function saveGroups(next: FieldGroup[]) {
    await updateCollectionMeta(projectId, collectionId, { options: { fieldGroups: next } });
    setGroups(next);
  }

  async function saveConditionalLogic(fieldId: number, rule: ConditionalLogicRule | null) {
    const field = items.find((f) => f.id === fieldId);
    if (!field) return;
    const options = { ...field.options };
    if (rule) options.conditionalLogic = rule;
    else delete options.conditionalLogic;

    await updateField(projectId, collectionId, fieldId, {
      type: field.type,
      label: field.label,
      name: field.name,
      description: field.description,
      placeholder: field.placeholder,
      options,
      validations: field.validations,
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (q && !item.label.toLowerCase().includes(q) && !item.name.toLowerCase().includes(q)) {
        return false;
      }
      if (typeFilter && item.type !== typeFilter) return false;
      if (groupFilter) {
        const fieldGroup = item.options?.fieldGroupId ?? UNGROUPED;
        if (groupFilter !== fieldGroup) return false;
      }
      return true;
    });
  }, [items, search, typeFilter, groupFilter]);

  const usedTypes = useMemo(() => Array.from(new Set(items.map((i) => i.type))), [items]);

  // Grouped sections, in group-definition order, with an "Ungrouped" bucket
  // always last. Only rendered when at least one group exists — with none
  // defined, the list stays the plain flat view it always was.
  const sections = useMemo(() => {
    if (groups.length === 0) {
      return [{ id: UNGROUPED, name: null as string | null, items: filtered }];
    }
    const byGroup = new Map<string, FieldItem[]>();
    for (const item of filtered) {
      const key = item.options?.fieldGroupId ?? UNGROUPED;
      byGroup.set(key, [...(byGroup.get(key) ?? []), item]);
    }
    const result = groups
      .map((g) => ({ id: g.id, name: g.name, items: byGroup.get(g.id) ?? [] }))
      .filter((s) => s.items.length > 0);
    const ungrouped = byGroup.get(UNGROUPED) ?? [];
    if (ungrouped.length > 0) result.push({ id: UNGROUPED, name: "Ungrouped", items: ungrouped });
    return result;
  }, [filtered, groups]);

  return (
    <section className="surface-standard rounded-2xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
        <div>
          <h2 className="text-sm font-medium text-[#f2f3fb]">Fields</h2>
          <p className="mt-0.5 text-[11px] text-[#7680a3]">
            {items.length === 1 ? "1 definition" : `${items.length} definitions`}
            {filtered.length !== items.length && ` · ${filtered.length} shown`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGroupsManager((v) => !v)}
            className="button-secondary px-3"
          >
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            Field Groups
          </button>
          {!adding && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="button-primary px-4"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add field
            </button>
          )}
        </div>
      </header>

      {showGroupsManager && <GroupsManager groups={groups} onChange={saveGroups} />}

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] px-5 py-3">
          <label className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#7680a3]"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter fields…"
              aria-label="Filter fields"
              className="input-quiet h-8 w-48 pl-8 pr-2.5 text-xs"
            />
          </label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input-quiet h-8 px-2.5 text-xs"
            aria-label="Filter by type"
          >
            <option value="" className="bg-[#0b0c22]">
              All types
            </option>
            {usedTypes.map((t) => (
              <option key={t} value={t} className="bg-[#0b0c22]">
                {typeLabel(t)}
              </option>
            ))}
          </select>
          {groups.length > 0 && (
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="input-quiet h-8 px-2.5 text-xs"
              aria-label="Filter by group"
            >
              <option value="" className="bg-[#0b0c22]">
                All groups
              </option>
              {groups.map((g) => (
                <option key={g.id} value={g.id} className="bg-[#0b0c22]">
                  {g.name}
                </option>
              ))}
              <option value={UNGROUPED} className="bg-[#0b0c22]">
                Ungrouped
              </option>
            </select>
          )}
        </div>
      )}

      {pickerOpen && (
        <AddFieldTypeModal
          onClose={() => setPickerOpen(false)}
          onSelect={(type) => {
            setNewFieldType(type);
            setPickerOpen(false);
            setAdding(true);
          }}
        />
      )}

      {logicField && (
        <ConditionalLogicModal
          fields={items}
          initialFieldId={logicField.id}
          onClose={() => setLogicField(null)}
          onSave={saveConditionalLogic}
        />
      )}

      {adding && (
        <div className="border-b border-white/[0.07] p-5">
          <FieldForm
            initial={{ ...toFormState(), type: newFieldType }}
            siblings={siblings}
            groups={groups}
            submitLabel="Add field"
            onCancel={() => setAdding(false)}
            onSubmit={(input) => createField(projectId, collectionId, input)}
          />
        </div>
      )}

      {items.length === 0 && !adding ? (
        <p className="px-5 py-8 text-center text-sm text-[#b8bfd8]">
          No fields defined yet. Add one to shape this collection.
        </p>
      ) : filtered.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-[#b8bfd8]">
          No fields match this filter.
        </p>
      ) : (
        <div>
          {sections.map((section) => (
            <div key={section.id}>
              {section.name && (
                <p className="border-b border-white/[0.05] bg-white/[0.015] px-5 py-2 font-mono-code text-[10px] uppercase tracking-wide text-[#7680a3]">
                  {section.name}
                </p>
              )}
              {section.items.map((item) => (
                <FieldRow
                  key={item.id}
                  projectId={projectId}
                  collectionId={collectionId}
                  item={item}
                  siblings={siblings}
                  groups={groups}
                  isFirst={items[0]?.id === item.id}
                  isLast={items[items.length - 1]?.id === item.id}
                  onMove={move}
                  onConfigureLogic={setLogicField}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
