"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import type { FieldInput } from "./FieldsEditor";

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

export async function createField(projectId: string, collectionId: string, input: FieldInput) {
  await apiFetch(`/projects/${projectId}/collections/${collectionId}/fields`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  revalidatePath(`/projects/${projectId}/collections/${collectionId}`);
}

export async function updateField(
  projectId: string,
  collectionId: string,
  fieldId: number,
  input: FieldInput,
) {
  await apiFetch(`/projects/${projectId}/collections/${collectionId}/fields/${fieldId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  revalidatePath(`/projects/${projectId}/collections/${collectionId}`);
}

export async function deleteField(projectId: string, collectionId: string, fieldId: number) {
  await apiFetch(`/projects/${projectId}/collections/${collectionId}/fields/${fieldId}`, {
    method: "DELETE",
  });
  revalidatePath(`/projects/${projectId}/collections/${collectionId}`);
}

export async function reorderFields(
  projectId: string,
  collectionId: string,
  items: Array<{ id: number; order: number }>,
) {
  await apiFetch(`/projects/${projectId}/collections/${collectionId}/fields/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ items }),
  });
  revalidatePath(`/projects/${projectId}/collections/${collectionId}`);
}

// --- Content-model screen: header actions, clone/fork, dependencies,
// versions/comparison (see docs/PHASE-6-NOTES.md — none of this has a
// legacy equivalent). Co-located here rather than in the collections list's
// own actions.ts, which only ever needed name/slug/reorder/delete.

export interface CollectionMetaInput {
  name?: string;
  slug?: string;
  description?: string | null;
  options?: Record<string, unknown> | null;
}

export async function updateCollectionMeta(
  projectId: string,
  collectionId: string,
  input: CollectionMetaInput,
) {
  await apiFetch(`/projects/${projectId}/collections/${collectionId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  revalidatePath(`/projects/${projectId}/collections/${collectionId}`);
}

export async function cloneCollection(projectId: string, collectionId: string) {
  const result = await apiFetch(`/projects/${projectId}/collections/${collectionId}/clone`, {
    method: "POST",
  });
  revalidatePath(`/projects/${projectId}/collections`);
  return result as { id: number };
}

export async function forkCollection(
  projectId: string,
  collectionId: string,
  targetProjectId: number,
) {
  const result = await apiFetch(`/projects/${projectId}/collections/${collectionId}/fork`, {
    method: "POST",
    body: JSON.stringify({ targetProjectId }),
  });
  revalidatePath(`/projects/${projectId}/collections`);
  return result as { id: number };
}

export interface DependencyEntry {
  fieldId: number;
  fieldName: string;
  fieldLabel: string;
  collectionId: number;
  collectionName: string;
  collectionSlug: string;
}

export async function getDependencies(projectId: string, collectionId: string) {
  return apiFetch(`/projects/${projectId}/collections/${collectionId}/dependencies`, {
    method: "GET",
  }) as Promise<{ collectionId: number; dependents: DependencyEntry[] }>;
}

export interface CollectionVersion {
  id: number;
  label: string;
  snapshot: unknown;
  createdAt: string | null;
  createdBy: number | null;
}

// A plain read — no revalidatePath here (unlike its create/delete
// siblings below): calling revalidatePath during a render, rather than
// from a mutation, is a Next.js runtime error ("used revalidatePath ...
// during render which is unsupported"), and this is called directly from
// page.tsx's server render whenever the versions/comparison tab is open.
export async function listVersions(projectId: string, collectionId: string) {
  const result = await apiFetch(`/projects/${projectId}/collections/${collectionId}/versions`, {
    method: "GET",
  });
  return result as CollectionVersion[];
}

export async function createVersion(projectId: string, collectionId: string, label?: string) {
  const result = await apiFetch(`/projects/${projectId}/collections/${collectionId}/versions`, {
    method: "POST",
    body: JSON.stringify({ label }),
  });
  revalidatePath(`/projects/${projectId}/collections/${collectionId}`);
  return result as CollectionVersion;
}

export async function deleteVersion(projectId: string, collectionId: string, versionId: number) {
  await apiFetch(`/projects/${projectId}/collections/${collectionId}/versions/${versionId}`, {
    method: "DELETE",
  });
  revalidatePath(`/projects/${projectId}/collections/${collectionId}`);
}

export interface VersionDiffField {
  id: number;
  type: string;
  label: string;
  name: string;
  [key: string]: unknown;
}

export interface VersionComparison {
  from: { id: number; label: string };
  to: { id: number | null; label: string };
  added: VersionDiffField[];
  removed: VersionDiffField[];
  changed: Array<{ name: string; from: VersionDiffField; to: VersionDiffField }>;
}

export async function compareVersions(
  projectId: string,
  collectionId: string,
  fromVersionId: number,
  toVersionId: number | "current",
) {
  const query = toVersionId === "current" ? "current" : String(toVersionId);
  return apiFetch(
    `/projects/${projectId}/collections/${collectionId}/versions/${fromVersionId}/compare?to=${query}`,
    { method: "GET" },
  ) as Promise<VersionComparison>;
}

// --- Per-field clone/fork (see collection-fields.service.ts) ---------------

export async function cloneField(projectId: string, collectionId: string, fieldId: number) {
  await apiFetch(`/projects/${projectId}/collections/${collectionId}/fields/${fieldId}/clone`, {
    method: "POST",
  });
  revalidatePath(`/projects/${projectId}/collections/${collectionId}`);
}

export async function forkField(
  projectId: string,
  collectionId: string,
  fieldId: number,
  targetCollectionId: number,
) {
  await apiFetch(`/projects/${projectId}/collections/${collectionId}/fields/${fieldId}/fork`, {
    method: "POST",
    body: JSON.stringify({ targetCollectionId }),
  });
  revalidatePath(`/projects/${projectId}/collections/${collectionId}`);
}

// Used only by the Fork-collection modal's project picker (CollectionHeader.tsx)
// — GET /projects already scopes results to whatever projects the current
// user can see (super_admin sees all; everyone else sees their own
// admin/editor assignments), same as the main projects list page.
export async function listMyProjects() {
  const result = await apiFetch(`/projects`, { method: "GET" });
  return (result?.items ?? result ?? []) as Array<{ id: number; name: string }>;
}
