"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// docs/RBAC-TENANT-RECOMMENDATION.md section 7, section 8 step 7. Shared
// by every "Impersonate" entry point (MembersTable, DepartmentAdminsPanel)
// rather than each keeping its own local copy the way ../members/actions.ts
// and ../departments/[departmentId]/actions.ts each do -- those are scoped
// to one feature folder each, but impersonation is used from more than
// one, so it earns a shared home instead of a third duplicate.
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

  // Same empty-body guard as departments/[departmentId]/page.tsx's
  // apiGet -- a NestJS controller returning null serializes to an empty
  // body, not the literal string "null".
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export interface ImpersonationStart {
  auditLogId: number;
  userId: number;
  name: string;
  email: string;
}

// Server-side authorization + audit-log write only -- does NOT mint any
// token itself. The client component calling this is responsible for
// then calling useSession().update({ impersonating: {...} }) with the
// result, which is what actually swaps session.apiToken over (see
// apps/web/src/lib/auth.ts's jwt callback).
export async function startImpersonation(targetUserId: number): Promise<ImpersonationStart> {
  return apiFetch(`/impersonation/start`, {
    method: "POST",
    body: JSON.stringify({ targetUserId }),
  });
}

export async function endImpersonation(auditLogId: number): Promise<void> {
  await apiFetch(`/impersonation/end`, {
    method: "POST",
    body: JSON.stringify({ auditLogId }),
  });
}
