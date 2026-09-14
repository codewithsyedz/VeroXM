import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getProject } from "@/lib/get-project";
import MediaGrid, { type MediaItem } from "./MediaGrid";

interface MediaListResponse {
  data: MediaItem[];
  page: number;
  perPage: number;
  total: number;
}

async function getMedia(projectId: string, apiToken: string): Promise<MediaListResponse> {
  const res = await fetch(`${process.env.API_URL}/projects/${projectId}/media`, {
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Media API responded ${res.status}`);
  }

  return res.json();
}

export default async function ProjectMediaPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const [media, project] = session.apiToken
    ? await Promise.all([getMedia(projectId, session.apiToken), getProject(projectId, session.apiToken)])
    : [{ data: [], page: 1, perPage: 24, total: 0 }, null];

  return (
    <div className="container py-12">
      <header className="max-w-2xl">
        <p className="eyebrow">{project?.name ?? "Project assets"}</p>
        <h1 className="mt-3 text-[32px] font-medium tracking-tight text-[#f2f3fb] sm:text-[38px]">
          Media
        </h1>
        <p className="mt-3 text-[15px] leading-6 text-[#b8bfd8]">
          Files this project&apos;s content can reference, with the captions editors see.
        </p>
      </header>

      <div className="mt-10">
        <MediaGrid projectId={projectId} initialMedia={media.data} />
      </div>
    </div>
  );
}
