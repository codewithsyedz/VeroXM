"use client";

import { useState, useTransition } from "react";
import { Clock, Eye, EyeOff, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import {
  deleteContent,
  publishContent,
  restoreContent,
  trashContent,
  unpublishContent,
} from "./actions";

export interface ContentListItem {
  id: number;
  title: unknown;
  locale: string | null;
  publishedAt: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  trashed: boolean;
  createdBy: { id: number; email: string } | null;
  updatedBy: { id: number; email: string } | null;
  // §11.3's approval-status panel lives on the item's own edit page —
  // this is the same signal (an in-flight ContentApprovalRequest,
  // computed server-side, batched per page rather than per row) surfaced
  // here too, so a pending item doesn't require opening it to notice.
  pendingApproval: boolean;
}

export interface ContentListResponse {
  data: ContentListItem[];
  page: number;
  perPage: number;
  total: number;
  published: number;
  draft: number;
  trashed: number;
}

type StatusFilter = "all" | "published" | "draft" | "trashed";

function StatusBadge({ item }: { item: ContentListItem }) {
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

function ContentRow({
  projectId,
  collectionId,
  item,
}: {
  projectId: string;
  collectionId: string;
  item: ContentListItem;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      }
    });
  }

  const href = `/projects/${projectId}/collections/${collectionId}/content/${item.id}`;
  const title = String(item.title ?? "") || `#${item.id}`;

  return (
    <tr className="border-b border-white/[0.05] last:border-b-0 hover:bg-white/[0.02]">
      <td className="max-w-md px-4 py-4 align-top">
        {item.trashed ? (
          <span className="text-sm font-medium text-[#b8bfd8]">{title}</span>
        ) : (
          <a href={href} className="text-sm font-medium text-[#f2f3fb] hover:text-[#4da3ff]">
            {title}
          </a>
        )}
        {error && <p className="mt-1 text-xs text-[#ea6d76]">{error}</p>}
      </td>

      <td className="px-4 py-4 align-top font-mono-code text-[11px] text-[#7680a3]">
        {item.locale ?? "—"}
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

      <td className="px-4 py-4 align-top font-mono-code text-[11px] text-[#7680a3]">
        {item.updatedBy?.email ?? item.createdBy?.email ?? "—"}
      </td>

      <td className="px-4 py-4 align-top">
        <div className="flex items-center justify-end gap-0.5">
          {item.trashed ? (
            <>
              <button
                type="button"
                onClick={() => run(() => restoreContent(projectId, collectionId, item.id))}
                disabled={isPending}
                className="icon-button"
                aria-label={`Restore ${title}`}
                title="Restore"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => run(() => deleteContent(projectId, collectionId, item.id))}
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
              <a href={href} className="icon-button" aria-label={`Edit ${title}`} title="Edit">
                <Pencil className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() =>
                  run(() =>
                    item.publishedAt
                      ? unpublishContent(projectId, collectionId, item.id)
                      : publishContent(projectId, collectionId, item.id),
                  )
                }
                disabled={isPending}
                className="icon-button"
                aria-label={item.publishedAt ? `Unpublish ${title}` : `Publish ${title}`}
                title={item.publishedAt ? "Unpublish" : "Publish"}
              >
                {item.publishedAt ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => run(() => trashContent(projectId, collectionId, item.id))}
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
}

export default function ContentList({
  projectId,
  collectionId,
  initial,
  status,
  search,
}: {
  projectId: string;
  collectionId: string;
  initial: ContentListResponse;
  status: StatusFilter;
  search: string;
}) {
  const [searchInput, setSearchInput] = useState(search);

  function buildUrl(next: { status?: StatusFilter; search?: string; page?: number }) {
    const params = new URLSearchParams();
    params.set("status", next.status ?? status);
    const s = next.search !== undefined ? next.search : search;
    if (s) params.set("search", s);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    return `/projects/${projectId}/collections/${collectionId}/content?${params}`;
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
            placeholder="Search entries"
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

        <a
          href={`/projects/${projectId}/collections/${collectionId}/content/new`}
          className="button-primary px-4"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New entry
        </a>
      </div>

      {initial.data.length === 0 ? (
        <div className="surface-standard rounded-2xl p-10 text-center">
          <p className="text-sm text-[#b8bfd8]">
            {search ? `No entries match “${search}”.` : "Nothing here yet."}
          </p>
        </div>
      ) : (
        <div className="surface-standard overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  {["Entry", "Locale", "Status", "Updated", "By", ""].map((heading, i) => (
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
                {initial.data.map((item) => (
                  <ContentRow
                    key={item.id}
                    projectId={projectId}
                    collectionId={collectionId}
                    item={item}
                  />
                ))}
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
