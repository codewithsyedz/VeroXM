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

export async function uploadMedia(projectId: string, formData: FormData) {
  const token = await apiToken();

  const res = await fetch(`${process.env.API_URL}/projects/${projectId}/media/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Upload failed (${res.status})`);
  }

  revalidatePath(`/projects/${projectId}/media`);
}

export async function deleteMedia(projectId: string, mediaId: number) {
  const token = await apiToken();

  const res = await fetch(`${process.env.API_URL}/projects/${projectId}/media/${mediaId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Delete failed (${res.status})`);
  }

  revalidatePath(`/projects/${projectId}/media`);
}

export async function updateCaption(projectId: string, mediaId: number, caption: string) {
  const token = await apiToken();

  const res = await fetch(`${process.env.API_URL}/projects/${projectId}/media/${mediaId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ caption }),
  });

  if (!res.ok) {
    throw new Error(`Caption update failed (${res.status})`);
  }

  revalidatePath(`/projects/${projectId}/media`);
}
