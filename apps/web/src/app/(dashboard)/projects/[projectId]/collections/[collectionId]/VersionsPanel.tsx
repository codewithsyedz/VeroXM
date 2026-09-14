"use client";

import { useState, useTransition } from "react";
import { History, Plus, Trash2 } from "lucide-react";
import { formatRelative } from "@/lib/format";
import { createVersion, deleteVersion, type CollectionVersion } from "./actions";

// Versions — a point-in-time snapshot of this collection's field
// definitions, taken only on an explicit "Create Version" click (see
// collections.service.ts's createVersion() — no auto-snapshotting). No
// legacy precedent (see docs/PHASE-6-NOTES.md). Restoring a past version
// isn't implemented — this is list + label + delete + compare (via the
// Comparison tab), not a full undo system.
export default function VersionsPanel({
  projectId,
  collectionId,
  initialVersions,
}: {
  projectId: string;
  collectionId: string;
  initialVersions: CollectionVersion[];
}) {
  const [versions, setVersions] = useState(initialVersions);
  const [label, setLabel] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function create() {
    setError(null);
    startTransition(async () => {
      try {
        const created = await createVersion(projectId, collectionId, label || undefined);
        setVersions((v) => [created, ...v]);
        setLabel("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create version");
      }
    });
  }

  function remove(id: number) {
    startTransition(async () => {
      try {
        await deleteVersion(projectId, collectionId, id);
        setVersions((v) => v.filter((ver) => ver.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete version");
      }
    });
  }

  return (
    <section className="surface-standard rounded-2xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
        <div>
          <h2 className="text-sm font-medium text-[#f2f3fb]">Versions</h2>
          <p className="mt-0.5 text-[11px] text-[#7680a3]">
            Snapshots of this collection&apos;s field definitions over time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Version label (optional)"
            className="input-quiet h-9 w-52 px-3 text-xs"
          />
          <button
            type="button"
            onClick={create}
            disabled={isPending}
            className="button-primary px-3"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Create Version
          </button>
        </div>
      </header>

      {error && <p className="px-5 pt-3 text-xs text-[#ea6d76]">{error}</p>}

      {versions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
          <History className="h-8 w-8 text-[#4a5178]" aria-hidden="true" />
          <p className="text-sm text-[#b8bfd8]">No versions yet.</p>
          <p className="text-xs text-[#7680a3]">
            Create one to snapshot this collection&apos;s current fields.
          </p>
        </div>
      ) : (
        <ul>
          {versions.map((version) => (
            <li
              key={version.id}
              className="flex items-center justify-between gap-4 border-b border-white/[0.05] px-5 py-3.5 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#f2f3fb]">{version.label}</p>
                <p className="mt-0.5 font-mono-code text-[11px] text-[#7680a3]">
                  {formatRelative(version.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <a
                  href={`/projects/${projectId}/collections/${collectionId}?tab=comparison&from=${version.id}`}
                  className="text-xs font-medium text-[#4da3ff] hover:text-white"
                >
                  Compare
                </a>
                <button
                  type="button"
                  onClick={() => remove(version.id)}
                  disabled={isPending}
                  className="icon-button text-[#ea6d76] disabled:text-[#7680a3]"
                  aria-label={`Delete version ${version.label}`}
                  title="Delete version"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
