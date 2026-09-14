"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";

// Same shape as ../access/actions.ts's local apiFetch — no shared helper
// exists in this codebase yet (each feature folder keeps its own), so
// this mirrors that convention rather than introducing a new one.
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

  return res.status === 204 ? null : res.json();
}

export async function addMember(projectId: string, email: string, roleKind: string) {
  await apiFetch(`/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify({ email, roleKind }),
  });
  revalidatePath(`/projects/${projectId}/members`);
}

export async function removeMember(projectId: string, userId: number, roleKind: string) {
  await apiFetch(`/projects/${projectId}/members/${userId}?roleKind=${encodeURIComponent(roleKind)}`, {
    method: "DELETE",
  });
  revalidatePath(`/projects/${projectId}/members`);
}

// docs/RBAC-TENANT-RECOMMENDATION.md §11.6 — Project-level approval-
// workflow override, same "full replace" contract as
// departments/[departmentId]/actions.ts's saveApprovalWorkflow/
// removeApprovalWorkflow.
export async function saveProjectApprovalWorkflow(projectId: string, requiredRoleKinds: string[]) {
  await apiFetch(`/projects/${projectId}/approval-workflow`, {
    method: "PUT",
    body: JSON.stringify({ steps: requiredRoleKinds.map((requiredRoleKind) => ({ requiredRoleKind })) }),
  });
  revalidatePath(`/projects/${projectId}/members`);
}

export async function removeProjectApprovalWorkflow(projectId: string) {
  await apiFetch(`/projects/${projectId}/approval-workflow`, {
    method: "DELETE",
  });
  revalidatePath(`/projects/${projectId}/members`);
}
