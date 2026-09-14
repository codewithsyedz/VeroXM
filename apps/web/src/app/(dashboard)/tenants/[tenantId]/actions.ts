"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";

// Same local apiFetch shape as ../../departments/[departmentId]/actions.ts
// and the other feature folders — no shared helper exists in this
// codebase, each feature folder keeps its own.
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

export async function grantTenantAdmin(tenantId: string, email: string) {
  await apiFetch(`/tenants/${tenantId}/admins`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  revalidatePath(`/tenants/${tenantId}`);
}

export async function revokeTenantAdmin(tenantId: string, userId: number) {
  await apiFetch(`/tenants/${tenantId}/admins/${userId}`, {
    method: "DELETE",
  });
  revalidatePath(`/tenants/${tenantId}`);
}

// docs/RBAC-TENANT-RECOMMENDATION.md §11.14 -- name-only; slug is
// immutable (see TenantsService.updateTenant's own comment for why).
export async function updateTenant(tenantId: string, name: string) {
  const tenant = await apiFetch(`/tenants/${tenantId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath("/tenants");
  return tenant;
}

export async function deleteTenant(tenantId: string) {
  await apiFetch(`/tenants/${tenantId}`, {
    method: "DELETE",
  });
  revalidatePath("/tenants");
}
