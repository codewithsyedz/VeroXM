"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";

// Same local apiFetch shape as ../../projects/[projectId]/members/actions.ts
// and ../../projects/[projectId]/access/actions.ts — no shared helper
// exists in this codebase, each feature folder keeps its own.
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

export async function grantDepartmentAdmin(departmentId: string, email: string) {
  await apiFetch(`/departments/${departmentId}/admins`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  revalidatePath(`/departments/${departmentId}`);
}

export async function revokeDepartmentAdmin(departmentId: string, userId: number) {
  await apiFetch(`/departments/${departmentId}/admins/${userId}`, {
    method: "DELETE",
  });
  revalidatePath(`/departments/${departmentId}`);
}

export async function saveApprovalWorkflow(departmentId: string, requiredRoleKinds: string[]) {
  await apiFetch(`/departments/${departmentId}/approval-workflow`, {
    method: "PUT",
    body: JSON.stringify({ steps: requiredRoleKinds.map((requiredRoleKind) => ({ requiredRoleKind })) }),
  });
  revalidatePath(`/departments/${departmentId}`);
}

export async function removeApprovalWorkflow(departmentId: string) {
  await apiFetch(`/departments/${departmentId}/approval-workflow`, {
    method: "DELETE",
  });
  revalidatePath(`/departments/${departmentId}`);
}

export async function createCustomRole(departmentId: string, name: string, permissions: string[]) {
  await apiFetch(`/departments/${departmentId}/custom-roles`, {
    method: "POST",
    body: JSON.stringify({ name, permissions }),
  });
  revalidatePath(`/departments/${departmentId}`);
}

export async function deleteCustomRole(departmentId: string, roleId: number) {
  await apiFetch(`/departments/${departmentId}/custom-roles/${roleId}`, {
    method: "DELETE",
  });
  revalidatePath(`/departments/${departmentId}`);
}

export async function grantCustomRole(departmentId: string, roleId: number, email: string) {
  const grant = await apiFetch(`/departments/${departmentId}/custom-roles/${roleId}/grants`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  revalidatePath(`/departments/${departmentId}`);
  return grant as { userId: number; name: string; email: string };
}

export async function revokeCustomRole(departmentId: string, roleId: number, userId: number) {
  await apiFetch(`/departments/${departmentId}/custom-roles/${roleId}/grants/${userId}`, {
    method: "DELETE",
  });
  revalidatePath(`/departments/${departmentId}`);
}
