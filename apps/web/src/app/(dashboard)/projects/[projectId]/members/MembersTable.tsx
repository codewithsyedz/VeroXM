"use client";

import { useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { Trash2, UserCog, UserPlus, Users } from "lucide-react";
import { addMember, removeMember } from "./actions";
import { startImpersonation } from "@/app/(dashboard)/impersonation-actions";

export type ProjectRoleKind = "admin" | "editor" | "developer" | "viewer";
export type MemberSource = "direct" | "department_admin" | "tenant_admin";

export interface ProjectMember {
  userId: number;
  name: string;
  email: string;
  roleKind: ProjectRoleKind;
  source: MemberSource;
}

// docs/RBAC-TENANT-RECOMMENDATION.md §11.1/§11.2's flagged display gap,
// fixed: a Department/Tenant Admin's real, working access to this project
// (they never needed a direct role here to open it) now shows up as its
// own row instead of being invisible unless they also held admin{id}/
// editor{id} directly. Labeled so it reads as "why is this person here"
// rather than looking like a second, redundant direct grant.
const SOURCE_LABEL: Record<Exclude<MemberSource, "direct">, string> = {
  department_admin: "via Department Admin",
  tenant_admin: "via Tenant Admin",
};

const ROLE_OPTIONS: { value: ProjectRoleKind; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Schema, settings & content" },
  { value: "editor", label: "Editor", hint: "Content read/write" },
  { value: "developer", label: "Developer", hint: "API tokens & collections" },
  { value: "viewer", label: "Viewer", hint: "Read-only" },
];

const ROLE_LABEL: Record<ProjectRoleKind, string> = {
  admin: "Admin",
  editor: "Editor",
  developer: "Developer",
  viewer: "Viewer",
};

// Mirrors the badge treatment used elsewhere for status/role chips —
// a quiet tinted pill rather than a loud colored button.
const ROLE_BADGE_CLASS: Record<ProjectRoleKind, string> = {
  admin: "border-[rgba(77,163,255,0.35)] bg-[rgba(69,49,224,0.18)] text-[#4da3ff]",
  editor: "border-white/[0.1] bg-white/[0.04] text-[#b8bfd8]",
  developer: "border-white/[0.1] bg-white/[0.04] text-[#b8bfd8]",
  viewer: "border-white/[0.08] bg-white/[0.02] text-[#7680a3]",
};

export default function MembersTable({
  projectId,
  initialMembers,
}: {
  projectId: string;
  initialMembers: ProjectMember[];
}) {
  const { data: session, update } = useSession();
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState("");
  const [roleKind, setRoleKind] = useState<ProjectRoleKind>("editor");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!email.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await addMember(projectId, email.trim(), roleKind);
        // Re-fetching the exact server response (with real userId/name) is
        // more work than this needs right now — revalidatePath in the
        // server action already refreshes the page's own server-fetched
        // data on next navigation; optimistic-remove-then-refresh below
        // for revoke follows the same "good enough for this slice" bar.
        setEmail("");
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to grant role");
      }
    });
  }

  // docs/RBAC-TENANT-RECOMMENDATION.md section 7, section 8 step 7 --
  // authorization is enforced server-side in ImpersonationService.start
  // (Tenant Admin/Super Admin only, scoped to the actor's own Tenant
  // footprint); this button is shown to anyone who can reach this page
  // at all, same "not pre-emptively hidden by role" approach already
  // used for the approval-workflow actions (see ApprovalStatusPanel.tsx).
  function handleImpersonate(member: ProjectMember) {
    setError(null);
    startTransition(async () => {
      try {
        const target = await startImpersonation(member.userId);
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

  function handleRemove(userId: number, kind: ProjectRoleKind) {
    setError(null);
    startTransition(async () => {
      try {
        await removeMember(projectId, userId, kind);
        setMembers((prev) => prev.filter((m) => !(m.userId === userId && m.roleKind === kind)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to revoke role");
      }
    });
  }

  return (
    <div className="surface-standard rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Team</p>
          <h2 className="mt-2 text-lg font-medium text-[#f2f3fb]">Project members</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@example.com"
            className="input-quiet h-10 w-[220px] px-3 text-sm"
          />
          <select
            value={roleKind}
            onChange={(e) => setRoleKind(e.target.value as ProjectRoleKind)}
            className="input-quiet h-10 px-3 text-sm"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={isPending || !email.trim()}
            className="button-primary px-4"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {isPending ? "Working…" : "Grant role"}
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-[#7680a3]">
        Grants a role to an existing account by email — this doesn&apos;t create new users.
      </p>

      {error && <p className="mt-3 text-xs text-[#ea6d76]">{error}</p>}

      {members.length === 0 ? (
        <p className="mt-6 text-sm text-[#b8bfd8]">No one has an explicit role on this project yet.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {members.map((member) => (
            <div
              key={`${member.userId}-${member.roleKind}-${member.source}`}
              className="surface-inset flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-[#7680a3]" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-[#f2f3fb]">{member.name}</p>
                  <p className="mt-0.5 text-[11px] text-[#7680a3]">{member.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {member.source !== "direct" && (
                  <span className="text-[11px] text-[#7680a3]">{SOURCE_LABEL[member.source]}</span>
                )}
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${ROLE_BADGE_CLASS[member.roleKind]}`}
                >
                  {ROLE_LABEL[member.roleKind]}
                </span>
                {member.email !== session?.user?.email && (
                  <button
                    type="button"
                    onClick={() => handleImpersonate(member)}
                    disabled={isPending}
                    className="icon-button text-[#7680a3] hover:text-[#4da3ff] disabled:text-[#7680a3]"
                    aria-label={`Impersonate ${member.name}`}
                    title="Impersonate"
                  >
                    <UserCog className="h-4 w-4" />
                  </button>
                )}
                {member.source === "direct" ? (
                  <button
                    type="button"
                    onClick={() => handleRemove(member.userId, member.roleKind)}
                    disabled={isPending}
                    className="icon-button text-[#ea6d76] disabled:text-[#7680a3]"
                    aria-label={`Revoke ${ROLE_LABEL[member.roleKind]}`}
                    title="Revoke"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : (
                  // Nothing on THIS project to revoke — this row's admin
                  // grant lives on the Department/Tenant that covers it.
                  // A disabled icon (not omitted) keeps every row's action
                  // column the same width, and the title says where to go.
                  <span
                    className="icon-button cursor-not-allowed text-[#3a4262]"
                    aria-label="Manage on the Department page"
                    title="Manage on the Department page"
                  >
                    <Trash2 className="h-4 w-4" />
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
