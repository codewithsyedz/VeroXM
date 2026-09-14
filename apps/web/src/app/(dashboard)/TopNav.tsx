"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Building2, Landmark, Layers, LogOut, Menu, UserCog, X } from "lucide-react";
import { endImpersonation } from "./impersonation-actions";
import ApprovalsBell from "./ApprovalsBell";

// The identity bar only — logo, the one truly global destination
// (Projects), and account controls. The four-card Model/Content/Access
// band moved back out of here into ProjectNav, rendered inside each
// project's own pages instead of fused into this sticky header — see that
// component's comment for why.
export default function TopNav({ userEmail }: { userEmail?: string | null }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const onProjects = pathname?.startsWith("/projects") ?? false;
  const onDepartments = pathname?.startsWith("/departments") ?? false;
  const onTenants = pathname?.startsWith("/tenants") ?? false;

  // docs/RBAC-TENANT-RECOMMENDATION.md section 7, section 8 step 7. Read
  // live via useSession() (TopNav is already a client component) rather
  // than a server-passed prop: this needs to reflect the overlay the
  // instant useSession().update() sets it, from
  // MembersTable/DepartmentAdminsPanel, not just after a full page
  // reload picks up a fresh server session.
  const { data: session, update } = useSession();
  const impersonating = session?.impersonating;
  const [isEnding, startEndTransition] = useTransition();

  function handleEndImpersonation() {
    if (!impersonating) return;
    startEndTransition(async () => {
      try {
        await endImpersonation(impersonating.auditLogId);
      } catch {
        // Best-effort audit close-out -- still clear the local overlay
        // below even if this call fails, so the user is never stuck
        // impersonating in the UI with no way back to their own identity.
      }
      await update({ impersonating: null });
      window.location.href = "/projects";
    });
  }

  return (
    <>
      {impersonating && (
        <div className="sticky top-0 z-[60] flex items-center justify-center gap-3 border-b border-[rgba(77,163,255,0.35)] bg-[rgba(69,49,224,0.28)] px-4 py-2 text-[12px] text-[#f2f3fb]">
          <UserCog className="h-3.5 w-3.5 text-[#4da3ff]" aria-hidden="true" />
          <span>
            Impersonating <strong className="font-medium">{impersonating.name ?? impersonating.email}</strong>
          </span>
          <button
            type="button"
            onClick={handleEndImpersonation}
            disabled={isEnding}
            className="button-secondary h-6 px-2.5 text-[11px]"
          >
            {isEnding ? "Ending..." : "End impersonation"}
          </button>
        </div>
      )}
      <header className="sticky top-0 z-50 border-b border-white/[0.07] backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/projects" className="group flex min-w-0 items-center gap-3 text-left">
          <Image
            src="/brand/veroxm-mark.png"
            alt=""
            width={36}
            height={36}
            priority
            className="h-9 w-9 shrink-0"
          />
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold tracking-[0.14em] text-[#f2f3fb]">
              VEROXM
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[10px] font-mono-code text-[#7680a3]">
              <span className="status-dot" aria-hidden="true" />
              <span>Workspace ready</span>
            </span>
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden lg:flex h-full items-center gap-7">
          <Link
            href="/projects"
            aria-current={onProjects ? "page" : undefined}
            className={`relative flex h-full items-center gap-2 text-[13px] font-medium transition-colors ${
              onProjects ? "text-[#f2f3fb]" : "text-[#b8bfd8] hover:text-white"
            }`}
          >
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Projects</span>
            <span
              className={`absolute inset-x-0 bottom-0 h-0.5 bg-[#4da3ff] transition-transform duration-200 ${
                onProjects ? "scale-x-100" : "scale-x-0"
              }`}
              aria-hidden="true"
            />
          </Link>
          <Link
            href="/departments"
            aria-current={onDepartments ? "page" : undefined}
            className={`relative flex h-full items-center gap-2 text-[13px] font-medium transition-colors ${
              onDepartments ? "text-[#f2f3fb]" : "text-[#b8bfd8] hover:text-white"
            }`}
          >
            <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Departments</span>
            <span
              className={`absolute inset-x-0 bottom-0 h-0.5 bg-[#4da3ff] transition-transform duration-200 ${
                onDepartments ? "scale-x-100" : "scale-x-0"
              }`}
              aria-hidden="true"
            />
          </Link>
          <Link
            href="/tenants"
            aria-current={onTenants ? "page" : undefined}
            className={`relative flex h-full items-center gap-2 text-[13px] font-medium transition-colors ${
              onTenants ? "text-[#f2f3fb]" : "text-[#b8bfd8] hover:text-white"
            }`}
          >
            <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Tenants</span>
            <span
              className={`absolute inset-x-0 bottom-0 h-0.5 bg-[#4da3ff] transition-transform duration-200 ${
                onTenants ? "scale-x-100" : "scale-x-0"
              }`}
              aria-hidden="true"
            />
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <ApprovalsBell />
          {userEmail && (
            <span className="hidden text-xs font-mono-code text-[#7680a3] sm:inline">
              {userEmail}
            </span>
          )}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="button-secondary hidden sm:inline-flex px-3.5"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Sign out</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="icon-button lg:hidden"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-white/[0.07] bg-[#0b0c22] px-5 py-4 shadow-2xl">
          <Link
            href="/projects"
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-[#b8bfd8] hover:bg-white/[0.04]"
          >
            <Layers className="h-4 w-4" aria-hidden="true" />
            <span>Projects</span>
          </Link>
          <Link
            href="/departments"
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-[#b8bfd8] hover:bg-white/[0.04]"
          >
            <Building2 className="h-4 w-4" aria-hidden="true" />
            <span>Departments</span>
          </Link>
          <Link
            href="/tenants"
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-[#b8bfd8] hover:bg-white/[0.04]"
          >
            <Landmark className="h-4 w-4" aria-hidden="true" />
            <span>Tenants</span>
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="mt-3 flex min-h-11 w-full items-center gap-3 rounded-lg border-t border-white/[0.07] px-3 pt-4 text-left text-sm text-[#b8bfd8] hover:bg-white/[0.04]"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      )}
      </header>
    </>
  );
}
