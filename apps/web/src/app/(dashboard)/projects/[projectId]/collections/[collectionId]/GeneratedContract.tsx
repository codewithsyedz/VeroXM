"use client";

import { useMemo, useState } from "react";
import { Braces, Check, ChevronDown, ChevronRight, Copy } from "lucide-react";
import { generateContract, type FieldItem, type SiblingCollection } from "@/lib/fields";

// A read-only projection of the collection's real field definitions into
// the shape a public-API consumer can expect. Generated on every render
// from the fields as they currently are — this system has no stored schema
// version, so there's deliberately no version label on it.
export default function GeneratedContract({
  collectionSlug,
  fields,
  siblings,
}: {
  collectionSlug: string;
  fields: FieldItem[];
  siblings: SiblingCollection[];
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const json = useMemo(
    () => JSON.stringify(generateContract(collectionSlug, fields, siblings), null, 2),
    [collectionSlug, fields, siblings],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — the JSON stays on screen to select manually.
    }
  }

  return (
    <section className="surface-standard rounded-2xl">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-h-9 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 text-[#7680a3]" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[#7680a3]" aria-hidden="true" />
          )}
          <Braces className="h-4 w-4 text-[#7680a3]" aria-hidden="true" />
          <span className="text-sm font-medium text-[#f2f3fb]">Generated contract</span>
        </button>

        {open && (
          <button
            type="button"
            onClick={copy}
            className="icon-button"
            aria-label="Copy contract JSON"
          >
            {copied ? (
              <Check className="h-4 w-4 text-[#4da3ff]" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-white/[0.07] p-5">
          <p className="mb-3 text-xs leading-5 text-[#b8bfd8]">
            Derived from this collection&apos;s field definitions — fields hidden from the public
            API are excluded, exactly as the API excludes them.
          </p>
          <pre className="surface-inset overflow-x-auto rounded-lg p-4 font-mono-code text-[11px] leading-5 text-[#b8bfd8]">
            {json}
          </pre>
        </div>
      )}
    </section>
  );
}
