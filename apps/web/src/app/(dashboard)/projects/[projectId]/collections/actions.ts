"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";

async function apiToken() {
  const session = await getServerSession(authOptions);
  if (!session?.apiToken) {
    throw new Error("Not authenticated");
  }
  return session.apiToken;
}

async function apiFetch(path: string, init: RequestInit) {
  const token = await apiToken();
  const res = await fetch(`${process.env.API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      body?.errors ? JSON.stringify(body.errors) : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return res.status === 204 ? null : res.json();
}

export async function createCollection(projectId: string, name: string, slug: string) {
  await apiFetch(`/projects/${projectId}/collections`, {
    method: "POST",
    body: JSON.stringify({ name, slug }),
  });
  revalidatePath(`/projects/${projectId}/collections`);
}

export async function updateCollection(
  projectId: string,
  collectionId: number,
  name: string,
  slug: string,
) {
  await apiFetch(`/projects/${projectId}/collections/${collectionId}`, {
    method: "PATCH",
    body: JSON.stringify({ name, slug }),
  });
  revalidatePath(`/projects/${projectId}/collections`);
}

export async function deleteCollection(projectId: string, collectionId: number) {
  await apiFetch(`/projects/${projectId}/collections/${collectionId}`, {
    method: "DELETE",
  });
  revalidatePath(`/projects/${projectId}/collections`);
}

export async function reorderCollections(
  projectId: string,
  items: Array<{ id: number; order: number }>,
) {
  await apiFetch(`/projects/${projectId}/collections/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ items }),
  });
  revalidatePath(`/projects/${projectId}/collections`);
}
