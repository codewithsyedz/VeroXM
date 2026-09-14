"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// docs/RBAC-TENANT-RECOMMENDATION.md §11.8 -- own small copy of the
// apiToken/apiFetch pair (same shape as impersonation-actions.ts and every
// per-feature actions.ts in this app) rather than importing from another
// feature's file -- this is the one entry point for the approvals bell,
// so it doesn't earn a shared home the way impersonation (used from both
// MembersTable and DepartmentAdminsPanel) did.
async function apiToken() {
  const session = await getServerSession(authOptions);
  if (!session?.apiToken) {
    throw new Error("Not authenticated");
  }
  return session.apiToken;
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const token = await apiToken();
  const res = await fetch(`${process.env.API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.message ? String(body.message) : `Request failed (${res.status})`;
    throw new Error(message);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export interface PendingApproval {
  requestId: number;
  contentId: number;
  projectId: number;
  projectName: string;
  collectionId: number;
  collectionName: string;
  title: string;
  requiredRoleKind: string;
  stepOrder: number;
  totalSteps: number;
  submittedAt: string | null;
  href: string;
}

// Backs the nav-bar bell (ApprovalsBell.tsx) -- polled client-side on an
// interval. Server-side, ContentService.getPendingApprovalsForUser already
// does the real filtering (only requests whose current step this signed-in
// user actually satisfies); this is a thin, unauthenticated-by-itself pass
// through to GET /approvals/pending.
export async function getMyPendingApprovals(): Promise<PendingApproval[]> {
  const result = await apiFetch(`/approvals/pending`, { method: "GET" });
  return (result ?? []) as PendingApproval[];
}
