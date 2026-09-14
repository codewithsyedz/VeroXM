"use client";

import { useState, useTransition } from "react";
import { ArrowUpDown, ChevronDown, ChevronUp, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createCollection,
  deleteCollection,
  reorderCollections,
  updateCollection,
} from "./actions";

export interface CollectionItem {
  id: number;
  name: string;
  slug: string;
  order: number | null;
  // Present on rows from the list endpoint, which counts them for real;
  // optional so a locally-constructed item doesn't have to fake a number.
  fieldCount?: number;
  contentCount?: number;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function CollectionRow({
  projectId,
  item,
  isFirst,
  isLast,
  onMove,
}: {
  projectId: string;
  item: CollectionItem;
  isFirst: boolean;
  isLast: boolean;
  onMove: (id: number, direction: "up" | "down") => void;
}) {
  const [name, setName] = useState(item.name);
  const [slug, setSlug] = useState(item.slug);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateCollection(projectId, item.id, name, slug);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteCollection(projectId, item.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete");
      }
    });
  }

  return (
    <div className="surface-standard rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col">
          <button
            type="button"
            disabled={isFirst || isPending}
            onClick={() => onMove(item.id, "up")}
            className="icon-button h-6 w-6"
            aria-label="Move up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={isLast || isPending}
            onClick={() => onMove(item.id, "down")}
            className="icon-button h-6 w-6"
            aria-label="Move down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={save}
            className="input-quiet h-9 max-w-[220px] px-3 text-sm"
            placeholder="Name"
          />
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            onBlur={save}
            className="input-quiet h-9 max-w-[180px] px-3 font-mono-code text-xs"
            placeholder="slug"
          />
        </div>

        {(item.fieldCount !== undefined || item.contentCount !== undefined) && (
          <span className="hidden font-mono-code text-[11px] text-[#7680a3] sm:inline">
            {item.fieldCount ?? 0}f · {item.contentCount ?? 0}e
          </span>
        )}

        <a
          href={`/projects/${projectId}/collections/${item.id}/content`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[#4da3ff] hover:text-white"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          Content
        </a>

        <a
          href={`/projects/${projectId}/collections/${item.id}`}
          className="icon-button"
          aria-label="Edit fields"
          title="Edit fields"
        >
          <Pencil className="h-4 w-4" />
        </a>

        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          className="icon-button text-[#ea6d76] disabled:text-[#7680a3]"
          aria-label="Delete collection"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-[#ea6d76]">{error}</p>}
    </div>
  );
}

export default function CollectionsList({
  projectId,
  initialCollections,
}: {
  projectId: string;
  initialCollections: CollectionItem[];
}) {
  const [items, setItems] = useState(
    [...initialCollections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  );
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    setError(null);
    const slug = newSlug || slugify(newName);
    startTransition(async () => {
      try {
        await createCollection(projectId, newName, slug);
        setNewName("");
        setNewSlug("");
        setSlugTouched(false);
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create collection");
      }
    });
  }

  function move(id: number, direction: "up" | "down") {
    const index = items.findIndex((c) => c.id === id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= items.length) return;

    const next = [...items];
    [next[index], next[swapWith]] = [next[swapWith], next[index]];
    setItems(next);

    const reordered = next.map((c, i) => ({ id: c.id, order: i + 1 }));
    startTransition(() => reorderCollections(projectId, reordered));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="surface-inset rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              if (!slugTouched) setNewSlug(slugify(e.target.value));
            }}
            placeholder="New collection name"
            className="input-quiet h-10 max-w-[240px] px-3 text-sm"
          />
          <input
            value={newSlug}
            onChange={(e) => {
              setNewSlug(e.target.value);
              setSlugTouched(true);
            }}
            placeholder="slug"
            className="input-quiet h-10 max-w-[180px] px-3 font-mono-code text-xs"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={isPending || !newName.trim()}
            className="button-primary px-4"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {isPending ? "Working…" : "Add collection"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-[#ea6d76]">{error}</p>}
      </div>

      {items.length === 0 && (
        <p className="text-sm text-[#b8bfd8]">No collections yet.</p>
      )}

      {items.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-[#7680a3]">
          <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
          <span>{items.length} collection{items.length === 1 ? "" : "s"}</span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {items.map((item, i) => (
          <CollectionRow
            key={item.id}
            projectId={projectId}
            item={item}
            isFirst={i === 0}
            isLast={i === items.length - 1}
            onMove={move}
          />
        ))}
      </div>
    </div>
  );
}
