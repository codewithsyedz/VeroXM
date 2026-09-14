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
    const message = body?.message ?? `Request failed (${res.status})`;
    throw new Error(Array.isArray(message) ? message.join(", ") : message);
  }

  return res.status === 204 ? null : res.json();
}

export interface CreateProjectFields {
  name: string;
  slug?: string;
  description?: string;
  defaultLocale?: string;
  status?: string;
}

export interface CreatedProject {
  id: number;
  uuid: string;
  name: string;
  slug: string | null;
}

// Real POST /projects — see ProjectsService.create for what this ports
// from the legacy store() and what's intentionally left out (the blog
// template auto-seed). `slug` is this stack's own addition (legacy has no
// such concept) — auto-derived from `name` client-side if left blank, and
// immutable after creation (see updateProject, which doesn't accept it).
export async function createProject(fields: CreateProjectFields): Promise<CreatedProject> {
  const project = await apiFetch(`/projects`, {
    method: "POST",
    body: JSON.stringify(fields),
  });
  revalidatePath("/projects");
  return project;
}

export interface TemplateCollection {
  name: string;
  slug: string;
}

// Backs "Use Template": creates the project, then creates exactly the
// collections the chosen template lists — no fields, same as creating each
// one by hand from the Content Model screen (see templates-data.ts's own
// comment for why field-level schemas aren't invented here). Requires the
// creating user to actually have admin access to the new project, which
// ProjectsService.create now grants automatically — see that file's
// comment for why this deviates from legacy on that one point.
export async function createProjectFromTemplate(
  name: string,
  description: string | undefined,
  collections: TemplateCollection[],
): Promise<CreatedProject> {
  const project: CreatedProject = await apiFetch(`/projects`, {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });

  for (const collection of collections) {
    await apiFetch(`/projects/${project.id}/collections`, {
      method: "POST",
      body: JSON.stringify(collection),
    });
  }

  revalidatePath("/projects");
  return project;
}

export interface UpdateProjectFields {
  name?: string;
  description?: string;
  status?: string;
}

// Real PATCH /projects/:id — admin-tier, no legacy equivalent (see
// ProjectsService.update).
export async function updateProject(projectId: number, fields: UpdateProjectFields) {
  await apiFetch(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
  revalidatePath("/projects");
}

// Live/Staging has no legacy equivalent — this goes through the same
// admin-tier PATCH /projects/:id as updateProject above.
export async function setProjectStatus(projectId: number, status: "live" | "staging") {
  await updateProject(projectId, { status });
}

// Real DELETE /projects/:id — super_admin-tier (see ProjectsService.remove
// for the full cascade: content/content_meta force-deleted, media files +
// rows removed, collections soft-deleted, project itself soft-deleted).
// There's no per-project role exposed to this list view (same reasoning as
// ProjectStatusBadge's own comment) — anyone can open the confirmation,
// and a non-super-admin's attempt simply comes back as a server error,
// shown inline rather than hiding the button for a role this screen
// doesn't actually know.
export async function deleteProject(projectId: number) {
  await apiFetch(`/projects/${projectId}`, { method: "DELETE" });
  revalidatePath("/projects");
}
