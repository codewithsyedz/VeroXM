"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Bell } from "lucide-react";
import { getMyPendingApprovals, type PendingApproval } from "./approvals-actions";

const ROLE_LABEL: Record<string, string> = {
  admin: "Project Admin",
  department_admin: "Department Admin",
  tenant_admin: "Tenant Admin",
};

const POLL_INTERVAL_MS = 30_000;

// docs/RBAC-TENANT-RECOMMENDATION.md §11.3/§11.8 -- §11.3 flagged "no
// notification when a request needs your approval (an approver has to
// open the item to see it's waiting)" as the one remaining gap once
// Approve/Reject visibility itself was closed. This is that notification:
// a nav-bar bell, visible from anywhere in the app (TopNav renders it),
// listing every content item currently awaiting THIS signed-in user's
// approval action across every project/department they have access to --
// backed by ContentService.getPendingApprovalsForUser, which reuses the
// exact same satisfiesRoleKind check approveContent/rejectContent
// enforce, so nothing ever shown here could 403 if acted on.
//
// No push/webhook infrastructure exists in this stack (nor does email),
// so this polls on an interval rather than pushing -- the simplest thing
// that actually surfaces a waiting request without the user having to
// remember to go look. 30s keeps it feeling live without hammering the
// API; a real deployment with a meaningfully sized approval queue would
// want to revisit this (a shared SWR/React Query layer, or a real
// push channel) rather than each nav render owning its own interval.
export default function ApprovalsBell() {
  const [items, setItems] = useState<PendingApproval[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Live-verified gap: TopNav persists across client-side route changes
  // within the (dashboard) layout, and starting/ending impersonation is a
  // client-side session.update() -- neither remounts this component, so
  // without this, switching who you're impersonating would leave the
  // PREVIOUS identity's item count showing for up to POLL_INTERVAL_MS.
  // session.impersonating swaps the effective identity the server action
  // below acts as (apps/web/src/lib/auth.ts's jwt callback swaps
  // session.apiToken the same way), so re-running refresh() whenever this
  // key changes -- not just on mount and on the timer -- keeps the badge
  // honest through an impersonation switch instead of only eventually.
  const { data: session } = useSession();
  const identityKey = session?.impersonating?.userId ?? session?.user?.email ?? null;

  const refresh = useCallback(async () => {
    try {
      const result = await getMyPendingApprovals();
      setItems(result);
      setLoaded(true);
    } catch {
      // Best-effort -- a signed-out/expired-session moment (or a
      // mid-impersonation-switch race) shouldn't surface a visible error
      // in the nav bar. The next poll, or a fresh page load, tries again.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, identityKey]);

  useEffect(() => {
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Nothing to show yet (first fetch still in flight) -- render nothing
  // rather than a bell that flashes an incorrect "0" badge for a moment.
  if (!loaded) return null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="icon-button relative"
        aria-label={
          items.length ? `${items.length} item${items.length === 1 ? "" : "s"} awaiting your approval` : "No pending approvals"
        }
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {items.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#ea6d76] px-1 text-[10px] font-medium leading-none text-white">
            {items.length > 9 ? "9+" : items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/[0.08] bg-[#0f1030] p-2 shadow-2xl">
          <p className="px-3 py-2 text-xs font-medium text-[#7680a3]">Awaiting your approval</p>
          {items.length === 0 ? (
            <p className="px-3 pb-3 text-sm text-[#b8bfd8]">Nothing waiting on you right now.</p>
          ) : (
            <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
              {items.map((item) => (
                <Link
                  key={item.requestId}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex flex-col gap-0.5 rounded-xl px-3 py-2 text-sm hover:bg-white/[0.05]"
                >
                  <span className="truncate font-medium text-[#f2f3fb]">{item.title}</span>
                  <span className="text-xs text-[#7680a3]">
                    {item.projectName} · step {item.stepOrder} of {item.totalSteps} ·{" "}
                    {ROLE_LABEL[item.requiredRoleKind] ?? item.requiredRoleKind}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
