"use client";

import { useState, useTransition } from "react";
import { Plus, ShieldPlus, Trash2, UserPlus } from "lucide-react";
import { createCustomRole, deleteCustomRole, grantCustomRole, revokeCustomRole } from "./actions";

export type AssignablePermission =
  | "content:read"
  | "content:write"
  | "content:approve"
  | "content:publish"
  | "api-tokens:manage";

// docs/RBAC-TENANT-RECOMMENDATION.md section 5.6 -- deliberately mirrors
// (rather than imports -- no shared-types export exists for this catalog
// yet, same "no shared helper exists, each feature folder keeps its own"
// situation as this file's own apiFetch) apps/api/src/authz/
// permissions.ts's CUSTOM_ROLE_ASSIGNABLE_PERMISSIONS. Keep these two
// lists in sync by hand if the assignable set ever changes -- the server
// is the actual source of truth/enforcement either way.
const ASSIGNABLE_PERMISSIONS: { value: AssignablePermission; label: string }[] = [
  { value: "content:read", label: "Read content" },
  { value: "content:write", label: "Write content" },
  { value: "content:approve", label: "Approve content" },
  { value: "content:publish", label: "Publish content" },
  { value: "api-tokens:manage", label: "Manage API tokens" },
];

export interface CustomRoleGrant {
  userId: number;
  name: string;
  email: string;
}

export interface CustomRoleSummary {
  id: number;
  name: string;
  permissions: string[];
  grants: CustomRoleGrant[];
}

// `canManage` mirrors CustomRolesService.canConfigure exactly (Tenant
// Admin or Department Admin) -- which is the SAME rule
// DepartmentsService.canView already applies just to load this page at
// all (see CustomRolesService's own comment: canConfigure === canView
// for this feature, unlike ApprovalWorkflowsService's stricter
// Tenant-Admin-only gate) -- so the parent page passes true
// unconditionally rather than threading a separate field through
// DepartmentDetail just for this panel.
export default function CustomRolesPanel({
  departmentId,
  initialRoles,
  canManage,
}: {
  departmentId: string;
  initialRoles: CustomRoleSummary[];
  canManage: boolean;
}) {
  const [roles, setRoles] = useState(initialRoles);
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<AssignablePermission[]>([]);
  const [grantEmail, setGrantEmail] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function togglePermission(p: AssignablePermission) {
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function handleCreate() {
    if (!name.trim() || permissions.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        await createCustomRole(departmentId, name.trim(), permissions);
        setName("");
        setPermissions([]);
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create custom role");
      }
    });
  }

  function handleDelete(roleId: number) {
    setError(null);
    startTransition(async () => {
      try {
        await deleteCustomRole(departmentId, roleId);
        setRoles((prev) => prev.filter((r) => r.id !== roleId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete custom role");
      }
    });
  }

  function handleGrant(roleId: number) {
    const email = (grantEmail[roleId] ?? "").trim();
    if (!email) return;
    setError(null);
    startTransition(async () => {
      try {
        const grant = await grantCustomRole(departmentId, roleId, email);
        setGrantEmail((prev) => ({ ...prev, [roleId]: "" }));
        setRoles((prev) =>
          prev.map((r) => (r.id === roleId ? { ...r, grants: [...r.grants, grant] } : r)),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to grant custom role");
      }
    });
  }

  function handleRevoke(roleId: number, userId: number) {
    setError(null);
    startTransition(async () => {
      try {
        await revokeCustomRole(departmentId, roleId, userId);
        setRoles((prev) =>
          prev.map((r) => (r.id === roleId ? { ...r, grants: r.grants.filter((g) => g.userId !== userId) } : r)),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to revoke custom role");
      }
    });
  }

  return (
    <div className="surface-standard rounded-2xl p-6">
      <div>
        <p className="eyebrow">Access</p>
        <h2 className="mt-2 text-lg font-medium text-[#f2f3fb]">Custom roles</h2>
      </div>
      <p className="mt-2 text-xs text-[#7680a3]">
        Compose a narrower role from a fixed checklist of permissions -- e.g. a Content Approver who can approve
        and publish without full Admin/Editor access -- and grant it to people in this department.
      </p>

      {error && <p className="mt-3 text-xs text-[#ea6d76]">{error}</p>}

      {canManage && (
        <div className="surface-inset mt-4 rounded-lg p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Role name, e.g. Content Approver"
              className="input-quiet h-10 w-[240px] px-3 text-sm"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={isPending || !name.trim() || permissions.length === 0}
              className="button-primary px-4"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {isPending ? "Working…" : "Create role"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {ASSIGNABLE_PERMISSIONS.map((perm) => (
              <label key={perm.value} className="flex items-center gap-1.5 text-xs text-[#b8bfd8]">
                <input
                  type="checkbox"
                  checked={permissions.includes(perm.value)}
                  onChange={() => togglePermission(perm.value)}
                  className="h-3.5 w-3.5"
                />
                {perm.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {roles.length === 0 ? (
        <p className="mt-6 text-sm text-[#b8bfd8]">No custom roles defined for this department yet.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {roles.map((role) => (
            <div key={role.id} className="surface-inset rounded-lg p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldPlus className="h-4 w-4 text-[#7680a3]" aria-hidden="true" />
                  <p className="text-sm font-medium text-[#f2f3fb]">{role.name}</p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => handleDelete(role.id)}
                    disabled={isPending}
                    className="icon-button text-[#ea6d76] disabled:text-[#7680a3]"
                    aria-label={`Delete ${role.name}`}
                    title="Delete role"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {role.permissions.map((p) => (
                  <span
                    key={p}
                    className="rounded-full border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 text-[10px] text-[#b8bfd8]"
                  >
                    {p}
                  </span>
                ))}
              </div>

              <div className="mt-3 flex flex-col gap-2">
                {role.grants.map((g) => (
                  <div key={g.userId} className="flex items-center justify-between gap-2 text-xs text-[#b8bfd8]">
                    <span>
                      {g.name} <span className="text-[#7680a3]">({g.email})</span>
                    </span>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(role.id, g.userId)}
                        disabled={isPending}
                        className="icon-button text-[#ea6d76] disabled:text-[#7680a3]"
                        aria-label={`Revoke ${role.name} from ${g.name}`}
                        title="Revoke"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {role.grants.length === 0 && (
                  <p className="text-xs text-[#7680a3]">Nobody holds this role yet.</p>
                )}
                {canManage && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      value={grantEmail[role.id] ?? ""}
                      onChange={(e) => setGrantEmail((prev) => ({ ...prev, [role.id]: e.target.value }))}
                      placeholder="person@example.com"
                      className="input-quiet h-9 w-[200px] px-3 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleGrant(role.id)}
                      disabled={isPending || !(grantEmail[role.id] ?? "").trim()}
                      className="button-secondary h-9 px-3 text-xs"
                    >
                      <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                      Grant
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
