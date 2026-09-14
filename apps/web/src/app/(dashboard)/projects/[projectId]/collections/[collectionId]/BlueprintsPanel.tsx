"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Check } from "lucide-react";
import type { FieldInput } from "@/lib/fields";
import { createField } from "./actions";

interface Blueprint {
  id: string;
  name: string;
  description: string;
  fields: FieldInput[];
}

// Blueprints — reusable, curated field-set bundles a collection can adopt
// in one click. Same mechanism as the project-level "Use Template" flow
// (apps/web/src/app/(dashboard)/projects/templates-data.ts): loop-create
// real fields via the existing create-field endpoint, nothing fabricated.
// Unlike project templates (empty collections only), these bundles carry
// real field definitions — but the set of bundles itself is a fixed,
// hardcoded list, not a user-saveable library (see docs/PHASE-6-NOTES.md).
const BLUEPRINTS: Blueprint[] = [
  {
    id: "seo",
    name: "SEO Basics",
    description: "Meta title, meta description, and a canonical URL field.",
    fields: [
      { type: "text", label: "Meta Title", name: "metaTitle", validations: { charcount: { status: true, type: "Max", max: 60 } } },
      { type: "richtext", label: "Meta Description", name: "metaDescription", validations: { charcount: { status: true, type: "Max", max: 160 } } },
      { type: "text", label: "Canonical URL", name: "canonicalUrl" },
    ],
  },
  {
    id: "author-byline",
    name: "Author Byline",
    description: "Author name, avatar, and a short bio.",
    fields: [
      { type: "text", label: "Author Name", name: "authorName", validations: { required: { status: true } } },
      { type: "media", label: "Author Avatar", name: "authorAvatar", options: { media: { type: 1 } } },
      { type: "richtext", label: "Author Bio", name: "authorBio" },
    ],
  },
  {
    id: "publishing",
    name: "Publishing Schedule",
    description: "Publish date, expiry date, and a featured toggle.",
    fields: [
      { type: "date", label: "Publish Date", name: "publishDate" },
      { type: "date", label: "Expiry Date", name: "expiryDate" },
      { type: "boolean", label: "Featured", name: "featured" },
    ],
  },
  {
    id: "social-share",
    name: "Social Sharing",
    description: "Open Graph image and share text for social previews.",
    fields: [
      { type: "media", label: "Share Image", name: "shareImage", options: { media: { type: 1 } } },
      { type: "text", label: "Share Text", name: "shareText", validations: { charcount: { status: true, type: "Max", max: 200 } } },
    ],
  },
];

export default function BlueprintsPanel({
  projectId,
  collectionId,
  existingFieldNames,
}: {
  projectId: string;
  collectionId: string;
  existingFieldNames: string[];
}) {
  const router = useRouter();
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function apply(blueprint: Blueprint) {
    setError(null);
    setApplyingId(blueprint.id);
    startTransition(async () => {
      try {
        for (const field of blueprint.fields) {
          if (existingFieldNames.includes(field.name)) continue; // already present — skip, don't duplicate
          await createField(projectId, collectionId, field);
        }
        setAppliedId(blueprint.id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to apply blueprint");
      } finally {
        setApplyingId(null);
      }
    });
  }

  return (
    <section className="surface-standard rounded-2xl">
      <header className="border-b border-white/[0.07] px-5 py-4">
        <h2 className="text-sm font-medium text-[#f2f3fb]">Blueprints</h2>
        <p className="mt-0.5 text-[11px] text-[#7680a3]">
          Add a curated bundle of fields to this collection in one click
        </p>
      </header>

      {error && <p className="px-5 pt-3 text-xs text-[#ea6d76]">{error}</p>}

      <div className="grid gap-3 p-5 sm:grid-cols-2">
        {BLUEPRINTS.map((bp) => (
          <div
            key={bp.id}
            className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-[#7680a3]">
                <Boxes className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#f2f3fb]">{bp.name}</p>
                <p className="mt-0.5 text-xs text-[#7680a3]">{bp.description}</p>
              </div>
            </div>
            <p className="font-mono-code text-[11px] text-[#7680a3]">
              {bp.fields.map((f) => f.label).join(" · ")}
            </p>
            <button
              type="button"
              onClick={() => apply(bp)}
              disabled={isPending}
              className="button-secondary self-start px-3"
            >
              {appliedId === bp.id ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Applied
                </>
              ) : applyingId === bp.id ? (
                "Applying…"
              ) : (
                "Apply to this collection"
              )}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
