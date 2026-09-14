"use client";

import { useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { ShieldCheck, Trash2, UserCog, UserPlus } from "lucide-react";
import { grantTenantAdmin, revokeTenantAdmin } from "./actions";
import { startImpersonation } from "@/app/(dashboard)/impersonation-actions";

export interface TenantAdmin {
  userId: number;
  name: string;
  email: string;
}

// Mirrors ../../departments/[departmentId]/DepartmentAdminsPanel.tsx
// closely -- same grant form, same list shape, same impersonate button --
// with one deliberate difference: the revoke button is hidden on the
// signed-in user's own row. Department Admin is managed by the tier
// above it (Tenant Admin), so self-revoke can't happen through this
// panel; Tenant Admin is managed by Tenant Admins THEMSELVES (there's no
// tier between Tenant Admin and Super Admin), so without this guard a
// lone Tenant Admin could revoke their own access by mistake. Super
// Admin can always re-grant it, so this is a UI safety net against a
// misclick, not a backend restriction -- TenantsService.revokeTenantAdmin
// itself allows it, matching every other write path in this codebase
// having its authorization live in the service, not duplicated as a
// client-side-only rule.
export default function TenantAdminsPanel({
  tenantId,
  initialAdmins,
  canManage,
}: {
  tenantId: string;
  initialAdmins: TenantAdmin[];
  canManage: boolean;
}) {
  const { data: session, update } = useSession();
  const [admins, setAdmins] = useState(initialAdmins);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGrant() {
    if (!email.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await grantTenantAdmin(tenantId, email.trim());
        setEmail("");
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to grant Tenant Admin");
      }
    });
  }

  // Same "impersonate:user" server-side gate as DepartmentAdminsPanel's
  // own handleImpersonate -- see that comment for why this button isn't
  // additionally hidden by role here.
  function handleImpersonate(admin: TenantAdmin) {
    setError(null);
    startTransition(async () => {
      try {
        const target = await startImpersonation(admin.userId);
        await update({
          impersonating: {
            userId: String(target.userId),
            email: target.email,
            name: target.name,
            auditLogId: target.auditLogId,
          },
        });
        window.location.href = "/projects";
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start impersonation");
      }
    });
  }

  function handleRevoke(userId: number) {
    setError(null);
    startTransition(async () => {
      try {
        await revokeTenantAdmin(tenantId, userId);
        setAdmins((prev) => prev.filter((a) => a.userId !== userId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to revoke Tenant Admin");
      }
    });
  }

  return (
    <div className="surface-standard rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Access</p>
          <h2 className="mt-2 text-lg font-medium text-[#f2f3fb]">Tenant admins</h2>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
              className="input-quiet h-10 w-[220px] px-3 text-sm"
            />
            <button
              type="button"
              onClick={handleGrant}
              disabled={isPending || !email.trim()}
              className="button-primary px-4"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {isPending ? "Working…" : "Grant admin"}
            </button>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-[#7680a3]">
        A Tenant Admin sees and manages every Department in this tenant — and every project inside
        each of them — without needing a separate role on each one.
      </p>

      {error && <p className="mt-3 text-xs text-[#ea6d76]">{error}</p>}

      {admins.length === 0 ? (
        <p className="mt-6 text-sm text-[#b8bfd8]">No Tenant Admins yet.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {admins.map((admin) => {
            const isSelf = admin.email === session?.user?.email;
            return (
              <div
                key={admin.userId}
                className="surface-inset flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-4 w-4 text-[#7680a3]" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-[#f2f3fb]">
                      {admin.name}
                      {isSelf && <span className="ml-2 text-[11px] text-[#7680a3]">(you)</span>}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#7680a3]">{admin.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isSelf && (
                    <button
                      type="button"
                      onClick={() => handleImpersonate(admin)}
                      disabled={isPending}
                      className="icon-button text-[#7680a3] hover:text-[#4da3ff] disabled:text-[#7680a3]"
                      aria-label={`Impersonate ${admin.name}`}
                      title="Impersonate"
                    >
                      <UserCog className="h-4 w-4" />
                    </button>
                  )}
                  {canManage && !isSelf && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(admin.userId)}
                      disabled={isPending}
                      className="icon-button text-[#ea6d76] disabled:text-[#7680a3]"
                      aria-label="Revoke Tenant Admin"
                      title="Revoke"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
