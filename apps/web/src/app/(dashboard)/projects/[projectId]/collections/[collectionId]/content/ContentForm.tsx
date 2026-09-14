"use client";

import { useState, useTransition } from "react";
import { Image as ImageIcon, Info, X } from "lucide-react";
import { searchMedia, searchRelationContent, type MediaItem, type RelationCandidate } from "./actions";

export interface FieldSchema {
  id: number;
  type: string;
  label: string;
  name: string;
  description?: string | null;
  placeholder?: string | null;
  options?: {
    enumeration?: string[];
    relation?: { collection?: number; type?: 1 | 2 };
    media?: { type?: 1 | 2 };
    helpText?: string;
    defaultValue?: string;
    tooltip?: string;
    // Conditional Logic (see docs/PHASE-6-NOTES.md, and @/lib/fields'
    // ConditionalLogicRule / isFieldVisible — the same shape and evaluation
    // rules, kept as a small local duplicate here rather than an import
    // since this file already keeps its own self-contained FieldSchema
    // instead of the collection-editor's FieldItem/FieldInput).
    conditionalLogic?: {
      enabled?: boolean;
      action: "show" | "hide";
      dependsOn: string;
      operator: "equals" | "not_equals" | "contains" | "is_empty" | "is_not_empty";
      value?: string;
    };
    [key: string]: unknown;
  } | null;
  validations?: {
    required?: { status?: boolean; message?: string };
    unique?: { status?: boolean; message?: string };
    charcount?: { status?: boolean; type?: string; min?: number; max?: number };
  } | null;
}

// Evaluates one field's conditional-logic rule against the form's current
// data (keyed by field `name`) — same rule shape and semantics as
// @/lib/fields' isFieldVisible(), just against this file's own FieldSchema
// instead of FieldItem.
function isFieldVisible(field: FieldSchema, values: Record<string, unknown>): boolean {
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

export interface ContentFormData {
  locale?: string;
  published?: boolean;
  data: Record<string, unknown>;
}

export interface SiblingCollection {
  id: number;
  name: string;
}

function FieldInputControl({
  field,
  value,
  onChange,
  siblings,
  projectId,
}: {
  field: FieldSchema;
  value: unknown;
  onChange: (v: unknown) => void;
  siblings: SiblingCollection[];
  projectId: string;
}) {
  const placeholder = field.placeholder ?? undefined;

  switch (field.type) {
    case "richtext":
      return (
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={6}
          className="input-quiet px-3 py-2.5 text-sm"
        />
      );
    case "email":
      return (
        <input
          type="email"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input-quiet px-3 py-2.5 text-sm"
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder={placeholder}
          className="input-quiet px-3 py-2.5 text-sm"
        />
      );
    case "enumeration":
      return (
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="input-quiet px-3 py-2.5 text-sm"
        >
          <option value="" className="bg-[#0b0c22]">
            Select…
          </option>
          {(field.options?.enumeration ?? []).map((v) => (
            <option key={v} value={v} className="bg-[#0b0c22]">
              {v}
            </option>
          ))}
        </select>
      );
    case "boolean":
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 accent-[#4531e0]"
        />
      );
    case "date":
      return (
        <input
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="input-quiet w-auto px-3 py-2.5 text-sm"
        />
      );
    case "time":
      return (
        <input
          type="time"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="input-quiet w-auto px-3 py-2.5 text-sm"
        />
      );
    case "multi_enumeration": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const choices = field.options?.enumeration ?? [];
      return (
        <div className="flex flex-wrap gap-2">
          {choices.length === 0 && (
            <p className="text-xs text-[#7680a3]">No values defined for this field yet.</p>
          )}
          {choices.map((choice) => {
            const checked = selected.includes(choice);
            return (
              <label
                key={choice}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                  checked
                    ? "border-[#4da3ff] bg-[rgba(69,49,224,0.14)] text-[#4da3ff]"
                    : "border-white/[0.08] bg-white/[0.02] text-[#b8bfd8] hover:border-white/[0.16]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...selected, choice]
                        : selected.filter((v) => v !== choice),
                    )
                  }
                  className="sr-only"
                />
                {choice}
              </label>
            );
          })}
        </div>
      );
    }
    case "json":
      return (
        <textarea
          value={typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2)}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          className="input-quiet px-3 py-2.5 font-mono-code text-xs"
        />
      );
    case "password":
      return (
        <input
          type="password"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Leave blank to keep the existing value"
          className="input-quiet px-3 py-2.5 text-sm"
        />
      );
    case "media": {
      const arrayValue = (Array.isArray(value) ? value : []) as number[];
      return (
        <MediaPickerField
          projectId={projectId}
          selectedIds={arrayValue}
          single={field.options?.media?.type === 1}
          onChange={onChange}
        />
      );
    }
    case "relation": {
      const arrayValue = (Array.isArray(value) ? value : []) as number[];
      const targetCollectionId = field.options?.relation?.collection;
      const target = siblings.find((s) => s.id === targetCollectionId);
      if (!targetCollectionId) {
        return (
          <p className="text-xs text-[#7680a3]">
            This field has no related collection configured yet — set one on the Fields screen.
          </p>
        );
      }
      return (
        <div>
          <RelationPickerField
            projectId={projectId}
            targetCollectionId={targetCollectionId}
            selectedIds={arrayValue}
            single={field.options?.relation?.type === 1}
            onChange={onChange}
          />
          {target && <p className="mt-1.5 text-xs text-[#7680a3]">References: {target.name}</p>}
        </div>
      );
    }
    case "text":
    default:
      return (
        <input
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input-quiet px-3 py-2.5 text-sm"
        />
      );
  }
}

// A real, searchable media picker backed by the project's Media Library
// (see content/actions.ts's searchMedia). Selections resolve to a friendly
// filename + thumbnail as soon as they've been seen in a search result;
// until then (e.g. reopening an entry whose media hasn't been searched for
// yet this session) a selected id shows as a plain "Media #<id>" chip —
// a real, scope-limited picker rather than an invented full-fidelity one.
function MediaPickerField({
  projectId,
  selectedIds,
  single,
  onChange,
}: {
  projectId: string;
  selectedIds: number[];
  single: boolean;
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<Record<number, MediaItem>>({});

  function load(query: string) {
    setLoading(true);
    searchMedia(projectId, query || undefined)
      .then((items) => {
        setResults(items);
        setResolved((prev) => {
          const next = { ...prev };
          for (const item of items) next[item.id] = item;
          return next;
        });
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }

  function openPicker() {
    setOpen(true);
    load(search);
  }

  function toggle(item: MediaItem) {
    if (single) {
      onChange([item.id]);
      setOpen(false);
      return;
    }
    onChange(
      selectedIds.includes(item.id)
        ? selectedIds.filter((id) => id !== item.id)
        : [...selectedIds, item.id],
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {selectedIds.map((id) => {
          const item = resolved[id];
          return (
            <span
              key={id}
              className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] py-1 pl-1 pr-2 text-xs text-[#b8bfd8]"
            >
              {item?.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- thumbnails come from the project's own storage, not next/image's optimizer config
                <img
                  src={item.thumbUrl}
                  alt={item.fileName}
                  className="h-6 w-6 rounded object-cover"
                />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded bg-white/[0.05]">
                  <ImageIcon className="h-3.5 w-3.5 text-[#7680a3]" aria-hidden="true" />
                </span>
              )}
              {item?.fileName ?? `Media #${id}`}
              <button
                type="button"
                onClick={() => onChange(selectedIds.filter((existing) => existing !== id))}
                className="text-[#7680a3] hover:text-[#ea6d76]"
                aria-label={`Remove ${item?.fileName ?? `media #${id}`}`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          );
        })}
        <button type="button" onClick={openPicker} className="button-secondary h-8 px-3 text-xs">
          {selectedIds.length ? "Change" : "Choose"} media
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose media"
            className="surface-standard flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-medium text-[#f2f3fb]">Choose media</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="icon-button h-8 w-8"
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                load(e.target.value);
              }}
              placeholder="Search media…"
              className="input-quiet mt-4 h-10 px-3 text-sm"
              autoFocus
            />
            <div className="mt-4 flex-1 overflow-y-auto">
              {loading ? (
                <p className="py-8 text-center text-xs text-[#7680a3]">Loading…</p>
              ) : results.length === 0 ? (
                <p className="py-8 text-center text-xs text-[#7680a3]">No media found.</p>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {results.map((item) => {
                    const active = selectedIds.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggle(item)}
                        className={`flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors ${
                          active
                            ? "border-[#4da3ff] bg-[rgba(69,49,224,0.14)]"
                            : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16]"
                        }`}
                      >
                        {item.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- thumbnails come from the project's own storage, not next/image's optimizer config
                          <img
                            src={item.thumbUrl}
                            alt={item.fileName}
                            className="aspect-square w-full rounded object-cover"
                          />
                        ) : (
                          <span className="flex aspect-square w-full items-center justify-center rounded bg-white/[0.03]">
                            <ImageIcon className="h-5 w-5 text-[#7680a3]" aria-hidden="true" />
                          </span>
                        )}
                        <span className="truncate text-[11px] text-[#b8bfd8]">{item.fileName}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// A content entry's `title` (see content/actions.ts's searchRelationContent)
// can be any field value — a plain string most of the time, but nothing
// stops a collection's title field from being a number or left empty. This
// renders whatever it is as a short label, falling back to the id.
function relationLabel(candidate: RelationCandidate): string {
  if (candidate.title === null || candidate.title === undefined || candidate.title === "") {
    return `#${candidate.id}`;
  }
  return String(candidate.title);
}

// A real, searchable picker for Relation fields — mirrors MediaPickerField
// above, but searches the *target* collection's own entries
// (content/actions.ts's searchRelationContent) instead of the media
// library. Same scope limits apply: one page of search results at a time,
// and a selected id shows as a plain "#<id>" label until it's been seen in
// a search result this session.
function RelationPickerField({
  projectId,
  targetCollectionId,
  selectedIds,
  single,
  onChange,
}: {
  projectId: string;
  targetCollectionId: number;
  selectedIds: number[];
  single: boolean;
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<RelationCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<Record<number, RelationCandidate>>({});

  function load(query: string) {
    setLoading(true);
    searchRelationContent(projectId, targetCollectionId, query || undefined)
      .then((items) => {
        setResults(items);
        setResolved((prev) => {
          const next = { ...prev };
          for (const item of items) next[item.id] = item;
          return next;
        });
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }

  function openPicker() {
    setOpen(true);
    load(search);
  }

  function toggle(item: RelationCandidate) {
    if (single) {
      onChange([item.id]);
      setOpen(false);
      return;
    }
    onChange(
      selectedIds.includes(item.id)
        ? selectedIds.filter((id) => id !== item.id)
        : [...selectedIds, item.id],
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {selectedIds.map((id) => {
          const item = resolved[id];
          return (
            <span
              key={id}
              className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] py-1 pl-2.5 pr-2 text-xs text-[#b8bfd8]"
            >
              {item ? relationLabel(item) : `#${id}`}
              <button
                type="button"
                onClick={() => onChange(selectedIds.filter((existing) => existing !== id))}
                className="text-[#7680a3] hover:text-[#ea6d76]"
                aria-label={`Remove ${item ? relationLabel(item) : `entry #${id}`}`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          );
        })}
        <button type="button" onClick={openPicker} className="button-secondary h-8 px-3 text-xs">
          {selectedIds.length ? "Change" : "Choose"} entries
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose related entries"
            className="surface-standard flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-medium text-[#f2f3fb]">Choose related entries</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="icon-button h-8 w-8"
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                load(e.target.value);
              }}
              placeholder="Search entries…"
              className="input-quiet mt-4 h-10 px-3 text-sm"
              autoFocus
            />
            <div className="mt-4 flex-1 overflow-y-auto">
              {loading ? (
                <p className="py-8 text-center text-xs text-[#7680a3]">Loading…</p>
              ) : results.length === 0 ? (
                <p className="py-8 text-center text-xs text-[#7680a3]">No entries found.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {results.map((item) => {
                    const active = selectedIds.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggle(item)}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          active
                            ? "border-[#4da3ff] bg-[rgba(69,49,224,0.14)] text-[#4da3ff]"
                            : "border-transparent bg-white/[0.02] text-[#b8bfd8] hover:border-white/[0.16]"
                        }`}
                      >
                        <span className="truncate">{relationLabel(item)}</span>
                        <span className="ml-3 shrink-0 font-mono-code text-[11px] text-[#7680a3]">
                          #{item.id}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ContentForm({
  projectId,
  fields,
  siblings,
  initial,
  submitLabel,
  onSubmit,
}: {
  projectId: string;
  fields: FieldSchema[];
  siblings: SiblingCollection[];
  initial: ContentFormData;
  submitLabel: string;
  onSubmit: (form: ContentFormData) => Promise<void>;
}) {
  const [locale, setLocale] = useState(initial.locale ?? "");
  const [published, setPublished] = useState(!!initial.published);
  // A field's `options.defaultValue` only ever seeds a key that's actually
  // missing from the entry's data — this covers both a brand-new entry and
  // an existing one that predates a field being added to the schema. It
  // never overwrites a value the entry (or the user) already has, even an
  // empty string.
  const [data, setData] = useState<Record<string, unknown>>(() => {
    const seeded: Record<string, unknown> = { ...(initial.data ?? {}) };
    for (const field of fields) {
      const defaultValue = field.options?.defaultValue;
      if (defaultValue !== undefined && defaultValue !== "" && !(field.name in seeded)) {
        seeded[field.name] = field.type === "boolean" ? defaultValue === "true" : defaultValue;
      }
    }
    return seeded;
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);

    // json fields are edited as raw text in the textarea — parse back to a
    // real value before sending, same shape the API expects to re-encode.
    const payloadData: Record<string, unknown> = { ...data };
    for (const field of fields) {
      if (field.type === "json" && typeof payloadData[field.name] === "string") {
        try {
          payloadData[field.name] = JSON.parse(payloadData[field.name] as string);
        } catch {
          // leave as-is — the server will surface a validation error rather
          // than silently dropping unparsable JSON
        }
      }
    }

    startTransition(async () => {
      try {
        await onSubmit({ locale: locale || undefined, published, data: payloadData });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save content");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="surface-inset flex flex-wrap items-center gap-5 rounded-xl px-4 py-3.5">
        <label className="flex items-center gap-2 text-xs text-[#b8bfd8]">
          Locale
          <input
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            placeholder="e.g. en"
            className="input-quiet h-9 w-24 px-3 text-xs"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[#b8bfd8]">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#4531e0]"
          />
          Published
        </label>
      </div>

      <div className="flex flex-col gap-4">
        {fields.filter((field) => isFieldVisible(field, data)).map((field) => (
          <div key={field.id} className="surface-standard rounded-xl p-5">
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-[#f2f3fb]">
              {field.label}
              {field.validations?.required?.status && <span className="text-[#ea6d76]">*</span>}
              {field.options?.tooltip && (
                <span title={field.options.tooltip} className="cursor-help text-[#7680a3]">
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              )}
            </label>
            {field.description && <p className="mb-1.5 text-xs text-[#7680a3]">{field.description}</p>}
            <FieldInputControl
              field={field}
              value={data[field.name]}
              onChange={(v) => setData((d) => ({ ...d, [field.name]: v }))}
              siblings={siblings}
              projectId={projectId}
            />
            {field.options?.helpText && (
              <p className="mt-1.5 text-xs italic text-[#7680a3]">{field.options.helpText}</p>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="button-primary px-5"
        >
          {isPending ? "Saving…" : submitLabel}
        </button>
      </div>
      {error && <p className="whitespace-pre-wrap text-xs text-[#ea6d76]">{error}</p>}
    </div>
  );
}
