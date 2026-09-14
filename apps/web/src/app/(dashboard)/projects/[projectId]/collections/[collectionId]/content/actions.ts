"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import type { ContentFormData } from "./ContentForm";

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
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.errors ? JSON.stringify(body.errors) : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return res.status === 204 ? null : res.json();
}

function basePath(projectId: string, collectionId: string) {
  return `/projects/${projectId}/collections/${collectionId}/content`;
}

// A real (if minimal) media picker for ContentForm's media fields — the
// first page of a search against the project's Media Library, same
// endpoint/shape the Media Library screen itself uses
// (MediaService.list -> { data: MediaView[] }). Not paginated in the UI
// yet: a project with more than a page of matching media needs a
// narrower search to find older items. See docs/PHASE-6-NOTES.md.
export interface MediaItem {
  id: number;
  fileName: string;
  fullUrl: string;
  thumbUrl: string | null;
  caption: string | null;
}

export async function searchMedia(projectId: string, search?: string): Promise<MediaItem[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const query = params.toString();
  const result = await apiFetch(`/projects/${projectId}/media${query ? `?${query}` : ""}`, {
    method: "GET",
  });
  return (result?.data ?? []) as MediaItem[];
}

// Backs the Relation field picker (ContentForm's RelationPickerField) the
// same way searchMedia backs the media picker — a real search against the
// *target* collection's own admin content list endpoint
// (ContentService.list, the same one the Content screen itself uses),
// rather than a raw "type in the content id" box. `title` reuses that
// endpoint's own title-field convention (a `title`/`name` field, falling
// back to the collection's first field) — a collection that uses neither
// name simply shows no title, same rule the Content list already follows.
export interface RelationCandidate {
  id: number;
  title: unknown;
}

export async function searchRelationContent(
  projectId: string,
  targetCollectionId: number,
  search?: string,
): Promise<RelationCandidate[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("each", "20");
  const result = await apiFetch(
    `/projects/${projectId}/collections/${targetCollectionId}/content?${params.toString()}`,
    { method: "GET" },
  );
  return ((result?.data ?? []) as Array<{ id: number; title: unknown }>).map((row) => ({
    id: row.id,
    title: row.title,
  }));
}

export async function createContent(
  projectId: string,
  collectionId: string,
  form: ContentFormData,
) {
  await apiFetch(`${basePath(projectId, collectionId)}`, {
    method: "POST",
    body: JSON.stringify(form),
  });
  revalidatePath(basePath(projectId, collectionId));
  redirect(basePath(projectId, collectionId));
}

export async function updateContent(
  projectId: string,
  collectionId: string,
  contentId: number,
  form: ContentFormData,
) {
  await apiFetch(`${basePath(projectId, collectionId)}/${contentId}`, {
    method: "PATCH",
    body: JSON.stringify(form),
  });
  revalidatePath(basePath(projectId, collectionId));
  revalidatePath(`${basePath(projectId, collectionId)}/${contentId}`);
}

export async function publishContent(projectId: string, collectionId: string, contentId: number) {
  await apiFetch(`${basePath(projectId, collectionId)}/${contentId}/publish`, { method: "POST" });
  revalidatePath(basePath(projectId, collectionId));
}

export async function unpublishContent(projectId: string, collectionId: string, contentId: number) {
  await apiFetch(`${basePath(projectId, collectionId)}/${contentId}/unpublish`, { method: "POST" });
  revalidatePath(basePath(projectId, collectionId));
}

// docs/RBAC-TENANT-RECOMMENDATION.md §6, §8 step 6.
export async function approveContentAction(
  projectId: string,
  collectionId: string,
  contentId: number,
  comment?: string,
) {
  await apiFetch(`${basePath(projectId, collectionId)}/${contentId}/approval/approve`, {
    method: "POST",
    body: JSON.stringify({ comment }),
  });
  revalidatePath(basePath(projectId, collectionId));
  revalidatePath(`${basePath(projectId, collectionId)}/${contentId}`);
}

export async function rejectContentAction(
  projectId: string,
  collectionId: string,
  contentId: number,
  comment?: string,
) {
  await apiFetch(`${basePath(projectId, collectionId)}/${contentId}/approval/reject`, {
    method: "POST",
    body: JSON.stringify({ comment }),
  });
  revalidatePath(basePath(projectId, collectionId));
  revalidatePath(`${basePath(projectId, collectionId)}/${contentId}`);
}

export async function trashContent(projectId: string, collectionId: string, contentId: number) {
  await apiFetch(`${basePath(projectId, collectionId)}/${contentId}/trash`, { method: "POST" });
  revalidatePath(basePath(projectId, collectionId));
}

export async function restoreContent(projectId: string, collectionId: string, contentId: number) {
  await apiFetch(`${basePath(projectId, collectionId)}/${contentId}/restore`, { method: "POST" });
  revalidatePath(basePath(projectId, collectionId));
}

export async function deleteContent(projectId: string, collectionId: string, contentId: number) {
  await apiFetch(`${basePath(projectId, collectionId)}/${contentId}`, { method: "DELETE" });
  revalidatePath(basePath(projectId, collectionId));
}
