"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { updateTenant, deleteTenant } from "./actions";

// docs/RBAC-TENANT-RECOMMENDATION.md §11.14 -- rename + delete for the
// Tenant record itself, kept separate from TenantAdminsPanel (which only
// manages who administers it). canEditDetails and canDelete are
// deliberately distinct flags even though today canEditDetails is
// Super Admin/Tenant-Admin-of-this-tenant and canDelete is Super-Admin-
// only -- see TenantsService's own TenantDetail comments for why
// deleting a Tenant needs a stricter gate than renaming one.
export default function TenantDetailsPanel({
  tenantId,
  name: initialName,
  slug,
  canEditDetails,
  canDelete,
}: {
  tenantId: string;
  name: string;
  slug: string;
  canEditDetails: boolean;
  canDelete: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!name.trim()) {
      setError("Name can't be empty");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await updateTenant(tenantId, name.trim());
        setIsEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to rename tenant");
      }
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteTenant(tenantId);
        window.location.href = "/tenants";
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete tenant");
        setConfirmingDelete(false);
      }
    });
  }

  return (
    <div className="surface-standard rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Organization</p>
          <h2 className="mt-2 text-lg font-medium text-[#f2f3fb]">Tenant details</h2>
        </div>
        {canEditDetails && !isEditing && (
          <button type="button" onClick={() => setIsEditing(true)} className="button-secondary px-3.5">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit name
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="text-xs text-[#7680a3]">Name</label>
          {isEditing ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-quiet mt-1 h-10 w-full px-3 text-sm"
            />
          ) : (
            <p className="mt-1 text-sm text-[#f2f3fb]">{name}</p>
          )}
        </div>
        <div className="flex-1">
          <label className="text-xs text-[#7680a3]">Slug</label>
          <p className="mt-1 text-sm font-mono-code text-[#7680a3]">{slug}</p>
        </div>
      </div>

      {!isEditing && (
        <p className="mt-2 text-xs text-[#7680a3]">The slug can&apos;t be changed after creation.</p>
      )}

      {error && <p className="mt-3 text-xs text-[#ea6d76]">{error}</p>}

      {isEditing && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || !name.trim()}
            className="button-primary px-4"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setName(initialName);
              setIsEditing(false);
              setError(null);
            }}
            disabled={isPending}
            className="button-secondary px-3.5"
          >
            Cancel
          </button>
        </div>
      )}

      {canDelete && (
        <div className="mt-6 border-t border-white/[0.08] pt-5">
          <p className="text-xs text-[#7680a3]">
            Deleting a tenant is permanent and only possible while it has no departments.
          </p>
          <div className="mt-3 flex items-center gap-3">
            {confirmingDelete ? (
              <>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isPending}
                  className="button-secondary px-3.5 text-[#ea6d76]"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {isPending ? "Deleting…" : "Confirm delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={isPending}
                  className="button-secondary px-3.5"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="button-secondary px-3.5 text-[#ea6d76]"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete tenant
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
