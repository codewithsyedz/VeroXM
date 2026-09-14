"use client";

import { useState, useTransition } from "react";
import { Diff } from "lucide-react";
import {
  compareVersions,
  type CollectionVersion,
  type VersionComparison,
} from "./actions";

// Comparison — diffs one version against another version, or against the
// collection's live fields ("Current"). A separate tab from Versions per
// the reference design, even though it's driven by the same version list
// (see docs/PHASE-6-NOTES.md).
export default function ComparisonPanel({
  projectId,
  collectionId,
  versions,
  initialFromId,
}: {
  projectId: string;
  collectionId: string;
  versions: CollectionVersion[];
  initialFromId?: number;
}) {
  const [fromId, setFromId] = useState<number | undefined>(initialFromId ?? versions[0]?.id);
  const [toId, setToId] = useState<number | "current">("current");
  const [result, setResult] = useState<VersionComparison | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    if (!fromId) return;
    setError(null);
    startTransition(async () => {
      try {
        const comparison = await compareVersions(projectId, collectionId, fromId, toId);
        setResult(comparison);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to compare versions");
      }
    });
  }

  if (versions.length === 0) {
    return (
      <section className="surface-standard rounded-2xl">
        <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
          <Diff className="h-8 w-8 text-[#4a5178]" aria-hidden="true" />
          <p className="text-sm text-[#b8bfd8]">No versions to compare yet.</p>
          <p className="text-xs text-[#7680a3]">Create a version first, from the Versions tab.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="surface-standard rounded-2xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
        <div>
          <h2 className="text-sm font-medium text-[#f2f3fb]">Comparison</h2>
          <p className="mt-0.5 text-[11px] text-[#7680a3]">
            Diff two versions, or a version against the current fields
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={fromId ?? ""}
            onChange={(e) => setFromId(Number(e.target.value))}
            className="input-quiet h-9 px-3 text-xs"
            aria-label="From version"
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id} className="bg-[#0b0c22]">
                {v.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-[#7680a3]">vs</span>
          <select
            value={toId}
            onChange={(e) => setToId(e.target.value === "current" ? "current" : Number(e.target.value))}
            className="input-quiet h-9 px-3 text-xs"
            aria-label="To version"
          >
            <option value="current" className="bg-[#0b0c22]">
              Current fields
            </option>
            {versions.map((v) => (
              <option key={v.id} value={v.id} className="bg-[#0b0c22]">
                {v.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={run}
            disabled={isPending || !fromId}
            className="button-primary px-3"
          >
            {isPending ? "Comparing…" : "Compare"}
          </button>
        </div>
      </header>

      {error && <p className="px-5 pt-3 text-xs text-[#ea6d76]">{error}</p>}

      {result && (
        <div className="flex flex-col gap-4 p-5">
          <DiffSection title="Added" tone="added" fields={result.added} />
          <DiffSection title="Removed" tone="removed" fields={result.removed} />
          {result.changed.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-[#b8bfd8]">
                Changed ({result.changed.length})
              </p>
              <div className="flex flex-col gap-2">
                {result.changed.map((c) => (
                  <div
                    key={c.name}
                    className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3"
                  >
                    <p className="font-mono-code text-xs text-[#f2f3fb]">{c.name}</p>
                    <p className="mt-1 text-[11px] text-[#7680a3]">
                      {c.from.label} → {c.to.label} ({c.from.type} → {c.to.type})
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.added.length === 0 && result.removed.length === 0 && result.changed.length === 0 && (
            <p className="text-sm text-[#b8bfd8]">No differences between these two.</p>
          )}
        </div>
      )}
    </section>
  );
}

function DiffSection({
  title,
  tone,
  fields,
}: {
  title: string;
  tone: "added" | "removed";
  fields: VersionComparison["added"];
}) {
  if (fields.length === 0) return null;
  const color = tone === "added" ? "text-[#5fd98a]" : "text-[#ea6d76]";
  const sign = tone === "added" ? "+" : "−";
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-[#b8bfd8]">
        {title} ({fields.length})
      </p>
      <div className="flex flex-col gap-1.5">
        {fields.map((f) => (
          <p key={f.name} className={`font-mono-code text-xs ${color}`}>
            {sign} {f.name} <span className="text-[#7680a3]">({f.type})</span>
          </p>
        ))}
      </div>
    </div>
  );
}
