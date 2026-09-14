"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";

// The project-wide content screen acts on entries that each belong to a
// different collection, so these wrap the same per-collection endpoints the
// collection view uses — only the revalidated path differs.

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
    const message = body?.errors
      ? JSON.stringify(body.errors)
      : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return res.status === 204 ? null : res.json();
}

export type EntryAction = "publish" | "unpublish" | "trash" | "restore" | "delete";

function entryPath(projectId: string, collectionId: number, contentId: number) {
  return `/projects/${projectId}/collections/${collectionId}/content/${contentId}`;
}

async function runOne(
  projectId: string,
  collectionId: number,
  contentId: number,
  action: EntryAction,
) {
  const base = entryPath(projectId, collectionId, contentId);
  if (action === "delete") {
    await apiFetch(base, { method: "DELETE" });
    return;
  }
  await apiFetch(`${base}/${action}`, { method: "POST" });
}

export async function runEntryAction(
  projectId: string,
  collectionId: number,
  contentId: number,
  action: EntryAction,
) {
  await runOne(projectId, collectionId, contentId, action);
  revalidatePath(`/projects/${projectId}/content`);
}

// There's no bulk endpoint in this API — this genuinely performs one
// request per entry, in order, and reports how many succeeded rather than
// claiming a single atomic operation. A failure part-way through leaves the
// earlier entries changed, which is why the result is returned instead of
// throwing on the first error.
export async function runBulkEntryAction(
  projectId: string,
  entries: Array<{ collectionId: number; contentId: number }>,
  action: EntryAction,
) {
  let succeeded = 0;
  const failures: string[] = [];

  for (const entry of entries) {
    try {
      await runOne(projectId, entry.collectionId, entry.contentId, action);
      succeeded += 1;
    } catch (e) {
      failures.push(e instanceof Error ? e.message : `Entry ${entry.contentId} failed`);
    }
  }

  revalidatePath(`/projects/${projectId}/content`);
  return { succeeded, failed: failures.length, failures };
}
