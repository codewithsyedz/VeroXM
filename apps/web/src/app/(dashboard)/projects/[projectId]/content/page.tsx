import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getProject } from "@/lib/get-project";
import ProjectContentTable, {
  type CollectionOption,
  type ProjectContentResponse,
  type StatusFilter,
} from "./ProjectContentTable";

async function getContent(
  projectId: string,
  apiToken: string,
  sp: { status?: string; search?: string; page?: string },
): Promise<ProjectContentResponse> {
  const params = new URLSearchParams();
  params.set("getItems", sp.status ?? "all");
  if (sp.search) params.set("search", sp.search);
  if (sp.page) params.set("page", sp.page);

  const res = await fetch(`${process.env.API_URL}/projects/${projectId}/content?${params}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Content API responded ${res.status}`);
  return res.json();
}

async function getCollections(
  projectId: string,
  apiToken: string,
): Promise<CollectionOption[]> {
  const res = await fetch(`${process.env.API_URL}/projects/${projectId}/collections`, {
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: "no-store",
  });
  // This is only used to populate the collection filter dropdown below —
  // never essential to viewing or acting on content. If it's ever
  // forbidden for some role tier, show Content without the filter rather
  // than crashing the whole page (this used to be an admin-only route;
  // an Editor hitting a 403 here took down the entire page before the
  // backend guard was loosened to 'editor' tier).
  if (!res.ok) return [];
  return res.json();
}

export default async function ProjectContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;

  const session = await getServerSession(authOptions);
  if (!session?.apiToken) {
    redirect("/login");
  }

  const [list, collections, project] = await Promise.all([
    getContent(projectId, session.apiToken, sp),
    getCollections(projectId, session.apiToken),
    getProject(projectId, session.apiToken),
  ]);

  const status = (sp.status as StatusFilter) ?? "all";

  return (
    <div className="container py-12">
      <header className="max-w-2xl">
        <p className="eyebrow">{project.name}</p>
        <h1 className="mt-3 text-[32px] font-medium tracking-tight text-[#f2f3fb] sm:text-[38px]">
          Content
        </h1>
        <p className="mt-3 text-[15px] leading-6 text-[#b8bfd8]">
          Review work in progress across every collection, then publish with a clear record of
          what changed.
        </p>
      </header>

      <div className="mt-10">
        <ProjectContentTable
          projectId={projectId}
          initial={list}
          status={status}
          search={sp.search ?? ""}
          collections={collections}
        />
      </div>
    </div>
  );
}
