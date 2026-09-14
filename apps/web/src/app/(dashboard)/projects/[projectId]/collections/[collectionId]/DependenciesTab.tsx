import { Network } from "lucide-react";
import type { DependencyEntry } from "./actions";

// Dependencies — every relation field (anywhere in this project) whose
// `options.relation.collection` points at this one. Read-only: fixing a
// dependency means editing the referencing field itself, over on its own
// collection. No legacy precedent (see docs/PHASE-6-NOTES.md and
// collections.service.ts's dependencies()).
export default function DependenciesTab({
  projectId,
  dependents,
}: {
  projectId: string;
  dependents: DependencyEntry[];
}) {
  return (
    <section className="surface-standard rounded-2xl">
      <header className="border-b border-white/[0.07] px-5 py-4">
        <h2 className="text-sm font-medium text-[#f2f3fb]">Dependencies</h2>
        <p className="mt-0.5 text-[11px] text-[#7680a3]">
          Relation fields elsewhere in this project that point at this collection
        </p>
      </header>

      {dependents.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
          <Network className="h-8 w-8 text-[#4a5178]" aria-hidden="true" />
          <p className="text-sm text-[#b8bfd8]">Nothing depends on this collection.</p>
          <p className="text-xs text-[#7680a3]">
            No relation field in this project references it yet.
          </p>
        </div>
      ) : (
        <ul>
          {dependents.map((d) => (
            <li
              key={d.fieldId}
              className="flex items-center justify-between gap-4 border-b border-white/[0.05] px-5 py-3.5 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#f2f3fb]">{d.fieldLabel}</p>
                <p className="mt-0.5 font-mono-code text-[11px] text-[#7680a3]">
                  {d.fieldName} · relation field
                </p>
              </div>
              <a
                href={`/projects/${projectId}/collections/${d.collectionId}`}
                className="shrink-0 text-xs font-medium text-[#4da3ff] hover:text-white"
              >
                {d.collectionName} · #{d.collectionSlug}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
