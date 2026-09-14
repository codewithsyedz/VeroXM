"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import ContentForm from "./content/ContentForm";
import type { FieldItem, SiblingCollection } from "@/lib/fields";

// Visual Preview — the real content-entry form (ContentForm, the same
// component /content/new uses), rendered against a blank draft entry so
// editors can see exactly what filling this collection out will look like
// before any content exists. Nothing here is ever persisted: onSubmit is a
// no-op that just confirms the click, rather than posting to the real
// create-content endpoint. No legacy precedent (see docs/PHASE-6-NOTES.md).
export default function VisualPreviewTab({
  projectId,
  fields,
  siblings,
}: {
  projectId: string;
  fields: FieldItem[];
  siblings: SiblingCollection[];
}) {
  const [previewed, setPreviewed] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="surface-standard flex items-center gap-2 rounded-2xl px-5 py-3">
        <Sparkles className="h-4 w-4 shrink-0 text-[#4da3ff]" aria-hidden="true" />
        <p className="text-xs text-[#b8bfd8]">
          Preview mode — this is the real content-entry form for this collection. Nothing you
          type here is saved.
        </p>
      </div>

      {previewed && (
        <p className="rounded-xl border border-[rgba(95,217,138,0.25)] bg-[rgba(95,217,138,0.08)] px-4 py-2.5 text-xs text-[#5fd98a]">
          This was a preview only — no entry was created.
        </p>
      )}

      {fields.length === 0 ? (
        <p className="surface-standard rounded-2xl px-5 py-8 text-center text-sm text-[#b8bfd8]">
          Add fields to this collection to preview its entry form.
        </p>
      ) : (
        <ContentForm
          projectId={projectId}
          fields={fields}
          siblings={siblings}
          initial={{ data: {} }}
          submitLabel="Preview submit (not saved)"
          onSubmit={async () => {
            setPreviewed(true);
          }}
        />
      )}
    </div>
  );
}
