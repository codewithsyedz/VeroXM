"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";

// Same local apiFetch shape as [tenantId]/actions.ts and every other
// feature folder in this codebase — no shared helper exists here, each
// feature folder keeps its own.
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

// docs/RBAC-TENANT-RECOMMENDATION.md §11.14 -- Super Admin only;
// TenantsService.createTenant enforces that itself, this is just the
// server-action pass-through, matching every other feature folder here.
export async function createTenant(name: string, slug: string) {
  const tenant = await apiFetch(`/tenants`, {
    method: "POST",
    body: JSON.stringify({ name, slug }),
  });
  revalidatePath("/tenants");
  return tenant;
}
