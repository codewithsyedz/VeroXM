import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { authOptions } from "@/lib/auth";
import ContentList, { type ContentListResponse } from "./ContentList";

interface CollectionSummary {
  id: number;
  name: string;
  slug: string;
}

async function getCollection(
  projectId: string,
  collectionId: string,
  apiToken: string,
): Promise<CollectionSummary> {
  const res = await fetch(
    `${process.env.API_URL}/projects/${projectId}/collections/${collectionId}`,
    { headers: { Authorization: `Bearer ${apiToken}` }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Collection API responded ${res.status}`);
  return res.json();
}

async function getContentList(
  projectId: string,
  collectionId: string,
  apiToken: string,
  searchParams: { status?: string; search?: string; locale?: string; page?: string },
): Promise<ContentListResponse> {
  const params = new URLSearchParams();
  params.set("getItems", searchParams.status ?? "all");
  if (searchParams.search) params.set("search", searchParams.search);
  // docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §4.2.
  if (searchParams.locale) params.set("locale", searchParams.locale);
  if (searchParams.page) params.set("page", searchParams.page);

  const res = await fetch(
    `${process.env.API_URL}/projects/${projectId}/collections/${collectionId}/content?${params}`,
    { headers: { Authorization: `Bearer ${apiToken}` }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Content API responded ${res.status}`);
  return res.json();
}

export default async function ContentListPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; collectionId: string }>;
  searchParams: Promise<{ status?: string; search?: string; locale?: string; page?: string }>;
}) {
  const { projectId, collectionId } = await params;
  const sp = await searchParams;

  const session = await getServerSession(authOptions);
  if (!session?.apiToken) redirect("/login");

  const [collection, list] = await Promise.all([
    getCollection(projectId, collectionId, session.apiToken),
    getContentList(projectId, collectionId, session.apiToken, sp),
  ]);

  const status = (sp.status as "all" | "published" | "draft" | "trashed") ?? "all";

  return (
    <div className="container py-12">
      <a
        href={`/projects/${projectId}/content`}
        className="inline-flex min-h-9 items-center gap-1.5 text-xs text-[#7680a3] hover:text-[#4da3ff]"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        All content
      </a>

      <header className="mt-3 max-w-2xl">
        <p className="eyebrow">Collection entries</p>
        <div className="mt-3 flex flex-wrap items-baseline gap-3">
          <h1 className="text-[32px] font-medium tracking-tight text-[#f2f3fb] sm:text-[38px]">
            {collection.name}
          </h1>
          <span className="font-mono-code text-sm text-[#4da3ff]">#{collection.slug}</span>
        </div>
        <p className="mt-3 text-[15px] leading-6 text-[#b8bfd8]">
          Review work in progress, then publish with a clear record of what changed.
        </p>
      </header>

      <div className="mt-10">
        <ContentList
          projectId={projectId}
          collectionId={collectionId}
          initial={list}
          status={status}
          search={sp.search ?? ""}
          locale={sp.locale ?? ""}
        />
      </div>
    </div>
  );
}
