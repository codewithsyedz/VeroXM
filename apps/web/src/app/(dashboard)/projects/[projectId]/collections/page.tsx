import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getProject } from "@/lib/get-project";
import CollectionsSidebar, { type SidebarCollection } from "./CollectionsSidebar";
import CollectionsList, { type CollectionItem } from "./CollectionsList";

async function getCollections(
  projectId: string,
  apiToken: string,
): Promise<Array<SidebarCollection & CollectionItem>> {
  const res = await fetch(`${process.env.API_URL}/projects/${projectId}/collections`, {
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Collections API responded ${res.status}`);
  }

  return res.json();
}

export default async function ProjectCollectionsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.apiToken) {
    redirect("/login");
  }

  const [collections, project] = await Promise.all([
    getCollections(projectId, session.apiToken),
    getProject(projectId, session.apiToken),
  ]);

  return (
    <div className="container py-12">
      <header className="max-w-2xl">
        <p className="eyebrow">{project.name}</p>
        <h1 className="mt-3 text-[32px] font-medium tracking-tight text-[#f2f3fb] sm:text-[38px]">
          Structure with clarity
        </h1>
        <p className="mt-3 text-[15px] leading-6 text-[#b8bfd8]">
          Define the shapes your content can take, then give editorial teams a model they can read.
        </p>
      </header>

      <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <CollectionsSidebar projectId={projectId} collections={collections} />

        <div className="min-w-0">
          <CollectionsList projectId={projectId} initialCollections={collections} />
        </div>
      </div>
    </div>
  );
}
