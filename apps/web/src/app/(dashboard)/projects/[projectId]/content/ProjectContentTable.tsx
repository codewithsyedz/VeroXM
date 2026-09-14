"use client";

import { useState, useTransition } from "react";
import {
  Clock,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { runBulkEntryAction, runEntryAction, type EntryAction } from "./actions";

export interface ProjectContentItem {
  id: number;
  collectionId: number;
  collectionName: string | null;
  collectionSlug: string | null;
  title: unknown;
  summary: string | null;
  slug: string | null;
  locale: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  trashed: boolean;
  updatedBy: { id: number; email: string } | null;
  createdBy: { id: number; email: string } | null;
  // §11.3's approval-status panel lives on the item's own edit page —
  // this is the same signal (an in-flight ContentApprovalRequest,
  // computed server-side, batched per page rather than per row) surfaced
  // here too, so a pending item doesn't require opening it to notice.
  pendingApproval: boolean;
}

export interface ProjectContentResponse {
  data: ProjectContentItem[];
  page: number;
  perPage: number;
  total: number;
  published: number;
  draft: number;
  trashed: number;
}

export type StatusFilter = "all" | "published" | "draft" | "trashed";

export interface CollectionOption {
  id: number;
  name: string;
}

function StatusBadge({ item }: { item: ProjectContentItem }) {
  if (item.trashed) {
    return (
      <span className="inline-flex rounded-full border border-[rgba(234,109,118,0.3)] bg-[rgba(234,109,118,0.12)] px-2.5 py-0.5 font-mono-code text-[10px] text-[#ea6d76]">
        Trashed
      </span>
    );
  }
  if (item.publishedAt) {
    return (
      <span className="inline-flex rounded-full border border-[rgba(77,163,255,0.28)] bg-[rgba(69,49,224,0.14)] px-2.5 py-0.5 font-mono-code text-[10px] text-[#4da3ff]">
        Published
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-white/[0.10] bg-white/[0.03] px-2.5 py-0.5 font-mono-code text-[10px] text-[#b8bfd8]">
      Draft
    </span>
  );
}

// A Draft can additionally be sitting in someone's approval queue (§11.3) —
// shown as a second, separate badge rather than folded into StatusBadge
// above, so "Draft" still reads as the actual publish state and this reads
// as an overlay on top of it (the two are never mutually exclusive: an
// approved/rejected/withdrawn request no longer counts as pending, so this
// only ever appears alongside "Draft").
function PendingApprovalBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(77,163,255,0.35)] bg-[rgba(69,49,224,0.18)] px-2.5 py-0.5 font-mono-code text-[10px] text-[#4da3ff]">
      <Clock className="h-3 w-3" aria-hidden="true" />
      Pending approval
    </span>
  );
}

function NewEntryMenu({
  projectId,
  collections,
}: {
  projectId: string;
  collections: CollectionOption[];
}) {
  const [open, setOpen] = useState(false);

  if (collections.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="button-primary px-4"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        New entry
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="surface-standard absolute right-0 z-20 mt-2 max-h-72 w-60 overflow-y-auto rounded-xl p-1.5 shadow-2xl"
          >
            <p className="px-2.5 py-2 text-[11px] text-[#7680a3]">Choose a collection</p>
            {collections.map((collection) => (
              <a
                key={collection.id}
                role="menuitem"
                href={`/projects/${projectId}/collections/${collection.id}/content/new`}
                className="block truncate rounded-lg px-2.5 py-2 text-sm text-[#b8bfd8] hover:bg-white/[0.05] hover:text-[#f2f3fb]"
              >
                {collection.name}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function ProjectContentTable({
  projectId,
  initial,
  status,
  search,
  collections,
}: {
  projectId: string;
  initial: ProjectContentResponse;
  status: StatusFilter;
  search: string;
  collections: CollectionOption[];
}) {
  const [searchInput, setSearchInput] = useState(search);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const items = initial.data;

  function buildUrl(next: { status?: StatusFilter; search?: string; page?: number }) {
    const params = new URLSearchParams();
    params.set("status", next.status ?? status);
    const s = next.search !== undefined ? next.search : search;
    if (s) params.set("search", s);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    return `/projects/${projectId}/content?${params}`;
  }

  function toggle(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAll() {
    setSelected((prev) => (prev.length === items.length ? [] : items.map((i) => i.id)));
  }

  function single(item: ProjectContentItem, action: EntryAction) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await runEntryAction(projectId, item.collectionId, item.id, action);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      }
    });
  }

  function bulk(action: EntryAction) {
    const entries = items
      .filter((i) => selected.includes(i.id))
      .map((i) => ({ collectionId: i.collectionId, contentId: i.id }));
    if (entries.length === 0) return;

    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await runBulkEntryAction(projectId, entries, action);
        setSelected([]);
        setNotice(
          result.failed === 0
            ? `${result.succeeded} ${result.succeeded === 1 ? "entry" : "entries"} updated.`
            : `${result.succeeded} updated, ${result.failed} failed.`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Bulk action failed");
      }
    });
  }

  const tabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: initial.total },
    { key: "published", label: "Published", count: initial.published },
    { key: "draft", label: "Draft", count: initial.draft },
    { key: "trashed", label: "Trashed", count: initial.trashed },
  ];

  const totalForStatus =
    status === "published"
      ? initial.published
      : status === "draft"
        ? initial.draft
        : status === "trashed"
          ? initial.trashed
          : initial.total;
  const totalPages = Math.max(1, Math.ceil(totalForStatus / initial.perPage));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            window.location.href = buildUrl({ search: searchInput, page: 1 });
          }}
          className="relative flex-1 sm:max-w-sm"
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7680a3]"
            aria-hidden="true"
          />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search title, slug, or summary"
            aria-label="Search entries"
            className="input-quiet h-11 pl-9 pr-3 text-sm"
          />
        </form>

        <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] p-1">
          {tabs.map((tab) => (
            <a
              key={tab.key}
              href={buildUrl({ status: tab.key, page: 1 })}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                status === tab.key
                  ? "bg-white/[0.08] text-[#f2f3fb]"
                  : "text-[#b8bfd8] hover:text-white"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 font-mono-code text-[10px] text-[#7680a3]">{tab.count}</span>
            </a>
          ))}
        </div>

        <NewEntryMenu projectId={projectId} collections={collections} />
      </div>

      {selected.length > 0 && (
        <div className="surface-inset flex flex-wrap items-center gap-3 rounded-xl px-4 py-3">
          <span className="text-sm text-[#f2f3fb]">
            {selected.length} selected
          </span>
          <span className="text-[11px] text-[#7680a3]">
            Applied one entry at a time — there&apos;s no bulk endpoint behind this.
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => bulk("publish")}
              disabled={isPending}
              className="button-secondary px-3"
            >
              Publish
            </button>
            <button
              type="button"
              onClick={() => bulk("unpublish")}
              disabled={isPending}
              className="button-secondary px-3"
            >
              Unpublish
            </button>
            <button
              type="button"
              onClick={() => bulk("trash")}
              disabled={isPending}
              className="button-secondary px-3 text-[#ea6d76]"
            >
              Trash
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-[#ea6d76]">{error}</p>}
      {notice && <p className="text-xs text-[#4da3ff]">{notice}</p>}

      {items.length === 0 ? (
        <div className="surface-standard rounded-2xl p-10 text-center">
          <p className="text-sm text-[#b8bfd8]">
            {search ? `No entries match “${search}”.` : "No entries here yet."}
          </p>
        </div>
      ) : (
        <div className="surface-standard overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  <th scope="col" className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.length === items.length && items.length > 0}
                      onChange={toggleAll}
                      aria-label="Select all entries"
                      className="h-3.5 w-3.5 accent-[#4531e0]"
                    />
                  </th>
                  {["Entry", "Collection", "Status", "Updated", ""].map((heading, i) => (
                    <th
                      key={heading || `actions-${i}`}
                      scope="col"
                      className="px-4 py-3 text-left font-mono-code text-[10px] font-medium uppercase tracking-wider text-[#7680a3]"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const href = `/projects/${projectId}/collections/${item.collectionId}/content/${item.id}`;
                  const title = String(item.title ?? "") || `#${item.id}`;

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-white/[0.05] last:border-b-0 hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-4 align-top">
                        <input
                          type="checkbox"
                          checked={selected.includes(item.id)}
                          onChange={() => toggle(item.id)}
                          aria-label={`Select ${title}`}
                          className="mt-1 h-3.5 w-3.5 accent-[#4531e0]"
                        />
                      </td>

                      <td className="max-w-md px-4 py-4 align-top">
                        {item.trashed ? (
                          <span className="text-sm font-medium text-[#b8bfd8]">{title}</span>
                        ) : (
                          <a
                            href={href}
                            className="text-sm font-medium text-[#f2f3fb] hover:text-[#4da3ff]"
                          >
                            {title}
                          </a>
                        )}
                        {item.summary && (
                          <p className="mt-1 line-clamp-1 text-xs leading-5 text-[#b8bfd8]">
                            {item.summary}
                          </p>
                        )}
                        {item.slug && (
                          <p className="mt-1 truncate font-mono-code text-[11px] text-[#7680a3]">
                            /{item.slug.replace(/^\//, "")}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-4 align-top">
                        <a
                          href={`/projects/${projectId}/collections/${item.collectionId}`}
                          className="font-mono-code text-xs text-[#8f9bc9] hover:text-[#4da3ff]"
                        >
                          {item.collectionSlug ?? item.collectionName ?? "—"}
                        </a>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge item={item} />
                          {item.pendingApproval && <PendingApprovalBadge />}
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <span className="inline-flex items-center gap-1.5 font-mono-code text-[11px] text-[#7680a3]">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {formatDateTime(item.updatedAt ?? item.createdAt)}
                        </span>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="flex items-center justify-end gap-0.5">
                          {item.trashed ? (
                            <>
                              <button
                                type="button"
                                onClick={() => single(item, "restore")}
                                disabled={isPending}
                                className="icon-button"
                                aria-label={`Restore ${title}`}
                                title="Restore"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => single(item, "delete")}
                                disabled={isPending}
                                className="icon-button text-[#ea6d76]"
                                aria-label={`Delete ${title} permanently`}
                                title="Delete permanently"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <a
                                href={href}
                                className="icon-button"
                                aria-label={`Edit ${title}`}
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </a>
                              <button
                                type="button"
                                onClick={() =>
                                  single(item, item.publishedAt ? "unpublish" : "publish")
                                }
                                disabled={isPending}
                                className="icon-button"
                                aria-label={
                                  item.publishedAt ? `Unpublish ${title}` : `Publish ${title}`
                                }
                                title={item.publishedAt ? "Unpublish" : "Publish"}
                              >
                                {item.publishedAt ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => single(item, "trash")}
                                disabled={isPending}
                                className="icon-button text-[#ea6d76]"
                                aria-label={`Trash ${title}`}
                                title="Trash"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex flex-wrap gap-1.5">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={buildUrl({ page: p })}
              aria-current={p === initial.page ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 font-mono-code text-xs transition-colors ${
                p === initial.page
                  ? "bg-white/[0.08] text-[#f2f3fb]"
                  : "text-[#b8bfd8] hover:bg-white/[0.04]"
              }`}
            >
              {p}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
