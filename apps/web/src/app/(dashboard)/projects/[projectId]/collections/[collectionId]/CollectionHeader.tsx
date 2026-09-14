"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Copy, FileText, GitFork, Loader2, Pencil, Trash2, X } from "lucide-react";
import { formatRelative, pluralize } from "@/lib/format";
import { deleteCollection } from "../actions";
import {
  cloneCollection,
  forkCollection,
  listMyProjects,
  updateCollectionMeta,
} from "./actions";

// Header for the content-model detail screen — collection identity plus the
// collection-level actions the reference design puts up top (Clone, Fork,
// Delete). None of this has a legacy equivalent (see docs/PHASE-6-NOTES.md)
// except the rename affordance, which already existed on the collections
// list; this is a second, inline entry point to the same PATCH.
export default function CollectionHeader({
  projectId,
  collection,
}: {
  projectId: string;
  collection: {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    updatedAt: string | null;
    contentCount: number;
    fieldCount: number;
  };
}) {
  const router = useRouter();
  const [editingDescription, setEditingDescription] = useState(false);
  const [description, setDescription] = useState(collection.description ?? "");
  const [forking, setForking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function saveDescription() {
    setError(null);
    startTransition(async () => {
      try {
        await updateCollectionMeta(projectId, String(collection.id), { description });
        setEditingDescription(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save description");
      }
    });
  }

  function clone() {
    setError(null);
    startTransition(async () => {
      try {
        const created = await cloneCollection(projectId, String(collection.id));
        router.push(`/projects/${projectId}/collections/${created.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to clone collection");
      }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteCollection(projectId, collection.id);
        router.push(`/projects/${projectId}/collections`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete collection");
      }
    });
  }

  return (
    <div className="surface-feature rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-[24px] font-medium tracking-tight text-[#f2f3fb]">
              {collection.name}
            </h2>
            <span className="font-mono-code text-sm text-[#4da3ff]">#{collection.slug}</span>
            <span className="rounded border border-white/[0.10] bg-white/[0.03] px-1.5 py-0.5 font-mono-code text-[10px] text-[#7680a3]">
              Custom
            </span>
          </div>
          <p className="mt-2 font-mono-code text-[11px] text-[#7680a3]">
            {pluralize(collection.contentCount, "entry", "entries")} ·{" "}
            {pluralize(collection.fieldCount, "field")} · Updated{" "}
            {formatRelative(collection.updatedAt)}
          </p>

          {editingDescription ? (
            <div className="mt-3 flex max-w-xl items-start gap-2">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Describe what this content model is for…"
                className="input-quiet px-3 py-2 text-sm"
              />
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={saveDescription}
                  disabled={isPending}
                  className="button-primary h-8 px-3 text-xs"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDescription(collection.description ?? "");
                    setEditingDescription(false);
                  }}
                  className="button-secondary h-8 px-3 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingDescription(true)}
              className="mt-3 flex max-w-xl items-start gap-1.5 text-left text-sm text-[#b8bfd8] hover:text-white"
            >
              <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-[#7680a3]" aria-hidden="true" />
              {collection.description || "Add a description…"}
            </button>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <a
            href={`/projects/${projectId}/collections/${collection.id}/content`}
            className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-[#4da3ff] hover:text-white"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Entries
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>

          <button
            type="button"
            onClick={clone}
            disabled={isPending}
            className="button-secondary px-3"
            title="Clone this collection within the current project"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Clone
          </button>

          <button
            type="button"
            onClick={() => setForking(true)}
            className="button-secondary px-3"
            title="Fork this collection into another project"
          >
            <GitFork className="h-3.5 w-3.5" aria-hidden="true" />
            Fork
          </button>

          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="icon-button text-[#ea6d76]"
            aria-label="Delete collection"
            title="Delete collection"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-xs text-[#ea6d76]">{error}</p>}

      {forking && (
        <ForkCollectionModal
          projectId={projectId}
          collectionId={collection.id}
          onClose={() => setForking(false)}
        />
      )}

      {deleting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDeleting(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Delete Collection"
            className="surface-standard w-full max-w-sm rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-medium text-[#f2f3fb]">Delete &quot;{collection.name}&quot;?</h2>
            <p className="mt-2 text-sm text-[#b8bfd8]">
              This permanently deletes every field and entry in this collection. Type the
              collection name to confirm.
            </p>
            <input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={collection.name}
              className="input-quiet mt-3 h-10 w-full px-3 text-sm"
            />
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={remove}
                disabled={isPending || confirmName !== collection.name}
                className="button-primary bg-[#ea6d76] px-4 hover:bg-[#d85a63]"
              >
                {isPending ? "Deleting…" : "Delete permanently"}
              </button>
              <button
                type="button"
                onClick={() => setDeleting(false)}
                className="button-secondary px-4"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ForkCollectionModal({
  projectId,
  collectionId,
  onClose,
}: {
  projectId: string;
  collectionId: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<Array<{ id: number; name: string }> | null>(null);
  const [targetId, setTargetId] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    listMyProjects()
      .then((list) => {
        const others = list.filter((p) => String(p.id) !== projectId);
        setProjects(others);
        setTargetId(others[0]?.id);
      })
      .catch(() => setProjects([]));
  }, [projectId]);

  function submit() {
    if (!targetId) return;
    setError(null);
    startTransition(async () => {
      try {
        const created = await forkCollection(projectId, String(collectionId), targetId);
        router.push(`/projects/${targetId}/collections/${created.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fork collection");
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
        aria-label="Fork Collection"
        className="surface-standard w-full max-w-sm rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-medium text-[#f2f3fb]">Fork to another project</h2>
          <button
            type="button"
            onClick={onClose}
            className="icon-button h-8 w-8 shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1 text-sm text-[#b8bfd8]">
          Copies this collection and all its fields into a project you have admin access to.
        </p>

        {projects === null ? (
          <p className="mt-4 text-sm text-[#7680a3]">Loading your projects…</p>
        ) : projects.length === 0 ? (
          <p className="mt-4 text-sm text-[#b8bfd8]">
            No other projects available to fork into.
          </p>
        ) : (
          <select
            value={targetId ?? ""}
            onChange={(e) => setTargetId(Number(e.target.value))}
            className="input-quiet mt-4 h-10 w-full px-3 text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id} className="bg-[#0b0c22]">
                {p.name}
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
            {isPending ? "Forking…" : "Fork collection"}
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
