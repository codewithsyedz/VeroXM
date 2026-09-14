// Shared "look up this project's own name/uuid" fetch -- used by every
// project-scoped page's heading (Content model, Content, Media, Members,
// Developer) so they all show which project you're actually in, not just
// a generic section label. One source of truth instead of five near-
// identical copies of the same fetch drifting apart from each other.

export interface ProjectSummary {
  id: number;
  uuid: string;
  name: string;
}

export async function getProject(projectId: string, apiToken: string): Promise<ProjectSummary> {
  const res = await fetch(`${process.env.API_URL}/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Project API responded ${res.status}`);
  }

  return res.json();
}
