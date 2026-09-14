"use client";

import { useMemo, useState } from "react";
import { Lock, Search, Settings2 } from "lucide-react";

export interface SidebarCollection {
  id: number;
  name: string;
  slug: string;
  fieldCount: number;
  contentCount: number;
}

// Slugs the API reserves for a project's own built-in routes — the same
// list CollectionsService guards on when creating or renaming. Shown with a
// lock so it's clear why the name can't be reused, rather than the
// reference's decorative "system collection" label.
const RESERVED_SLUGS = ["project-media"];

export default function CollectionsSidebar({
  projectId,
  collections,
  activeId,
}: {
  projectId: string;
  collections: SidebarCollection[];
  activeId?: number;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return collections;
    return collections.filter(
      (c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q),
    );
  }, [collections, query]);

  return (
    <aside className="surface-standard flex h-fit flex-col rounded-2xl lg:sticky lg:top-24">
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5">
        <h2 className="text-sm font-medium text-[#f2f3fb]">Collections</h2>
        <span className="font-mono-code text-[11px] text-[#7680a3]">{collections.length}</span>
      </header>

      <div className="p-3">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#7680a3]"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a collection"
            aria-label="Find a collection"
            className="input-quiet h-9 pl-8 pr-3 text-xs"
          />
        </label>
      </div>

      <div className="max-h-[520px] overflow-y-auto px-2 pb-2">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-[#7680a3]">
            {collections.length === 0 ? "No collections yet." : "Nothing matches that."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filtered.map((collection) => {
              const active = collection.id === activeId;
              return (
                <li key={collection.id}>
                  <a
                    href={`/projects/${projectId}/collections/${collection.id}`}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-lg border-l-2 px-3 py-2.5 transition-colors ${
                      active
                        ? "border-l-[#4da3ff] bg-white/[0.05]"
                        : "border-l-transparent hover:bg-white/[0.03]"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`truncate text-sm ${
                          active ? "font-medium text-[#f2f3fb]" : "text-[#b8bfd8]"
                        }`}
                      >
                        {collection.name}
                      </span>
                      {RESERVED_SLUGS.includes(collection.slug) && (
                        <Lock
                          className="h-3 w-3 shrink-0 text-[#7680a3]"
                          aria-label="Reserved slug"
                        />
                      )}
                    </span>
                    <span className="mt-0.5 block truncate font-mono-code text-[10px] text-[#7680a3]">
                      {collection.fieldCount === 1 ? "1 field" : `${collection.fieldCount} fields`} · #
                      {collection.slug}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="border-t border-white/[0.07] px-3 py-3">
        <a
          href={`/projects/${projectId}/collections`}
          className="inline-flex min-h-9 items-center gap-1.5 text-xs text-[#4da3ff] hover:text-white"
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
          Manage collections
        </a>
      </footer>
    </aside>
  );
}
