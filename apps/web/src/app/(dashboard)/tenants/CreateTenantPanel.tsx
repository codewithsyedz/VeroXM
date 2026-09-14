"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createTenant } from "./actions";

// docs/RBAC-TENANT-RECOMMENDATION.md §11.14 -- only ever rendered when
// the list endpoint's own canCreate is true (Super Admin only; see
// TenantsService.createTenant), so there's no separate role check here,
// the same convention every other panel in this codebase follows.
export default function CreateTenantPanel() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!name.trim() || !slug.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await createTenant(name.trim(), slug.trim());
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create tenant");
      }
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="button-primary px-4">
        <Plus className="h-4 w-4" aria-hidden="true" />
        New tenant
      </button>
    );
  }

  return (
    <div className="surface-standard rounded-2xl p-6">
      <p className="eyebrow">Organization</p>
      <h2 className="mt-2 text-lg font-medium text-[#f2f3fb]">New tenant</h2>
      <p className="mt-2 text-xs text-[#7680a3]">
        The slug can&apos;t be changed after creation — pick something stable (e.g. &quot;acme-corp&quot;).
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="text-xs text-[#7680a3]">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Corp"
            className="input-quiet mt-1 h-10 w-full px-3 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-[#7680a3]">Slug</label>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="acme-corp"
            className="input-quiet mt-1 h-10 w-full px-3 text-sm font-mono-code"
          />
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-[#ea6d76]">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleCreate}
          disabled={isPending || !name.trim() || !slug.trim()}
          className="button-primary px-4"
        >
          {isPending ? "Creating…" : "Create tenant"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="button-secondary px-3.5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
