import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { authOptions } from "@/lib/auth";
import ContentForm, { type ContentFormData, type FieldSchema, type SiblingCollection } from "../ContentForm";
import { updateContent } from "../actions";
import ApprovalStatusPanel, { type ApprovalStatus } from "../ApprovalStatusPanel";

interface CollectionDetail {
  id: number;
  name: string;
  fields: FieldSchema[];
  project: { collections: SiblingCollection[] };
}

interface ContentDetail {
  id: number;
  locale: string | null;
  publishedAt: string | null;
  data: Record<string, unknown>;
}

async function getCollection(
  projectId: string,
  collectionId: string,
  apiToken: string,
): Promise<CollectionDetail> {
  const res = await fetch(
    `${process.env.API_URL}/projects/${projectId}/collections/${collectionId}`,
    { headers: { Authorization: `Bearer ${apiToken}` }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Collection API responded ${res.status}`);
  return res.json();
}

async function getContent(
  projectId: string,
  collectionId: string,
  contentId: string,
  apiToken: string,
): Promise<ContentDetail> {
  const res = await fetch(
    `${process.env.API_URL}/projects/${projectId}/collections/${collectionId}/content/${contentId}`,
    { headers: { Authorization: `Bearer ${apiToken}` }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Content API responded ${res.status}`);
  return res.json();
}

async function getApprovalStatus(
  projectId: string,
  collectionId: string,
  contentId: string,
  apiToken: string,
): Promise<ApprovalStatus | null> {
  const res = await fetch(
    `${process.env.API_URL}/projects/${projectId}/collections/${collectionId}/content/${contentId}/approval`,
    { headers: { Authorization: `Bearer ${apiToken}` }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Approval API responded ${res.status}`);
  // Same empty-body-for-null case as departments/[departmentId]/page.tsx's
  // apiGet — most content items have never been submitted through a
  // workflow, so this is the common case, not an edge case.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default async function EditContentPage({
  params,
}: {
  params: Promise<{ projectId: string; collectionId: string; contentId: string }>;
}) {
  const { projectId, collectionId, contentId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.apiToken) redirect("/login");

  const [collection, content, approvalStatus] = await Promise.all([
    getCollection(projectId, collectionId, session.apiToken),
    getContent(projectId, collectionId, contentId, session.apiToken),
    getApprovalStatus(projectId, collectionId, contentId, session.apiToken),
  ]);
  const siblings = collection.project.collections.filter((c) => c.id !== collection.id);

  const initial: ContentFormData = {
    locale: content.locale ?? undefined,
    published: !!content.publishedAt,
    data: content.data,
  };

  return (
    <div className="container max-w-3xl py-12">
      <a
        href={`/projects/${projectId}/collections/${collectionId}/content`}
        className="inline-flex min-h-9 items-center gap-1.5 text-xs text-[#7680a3] hover:text-[#4da3ff]"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        All {collection.name}
      </a>

      <header className="mb-8 mt-3">
        <p className="eyebrow">
          {content.publishedAt ? "Published entry" : "Draft entry"}
        </p>
        <h1 className="mt-3 text-[30px] font-medium tracking-tight text-[#f2f3fb]">
          {collection.name}{" "}
          <span className="font-mono-code text-[#7680a3]">#{content.id}</span>
        </h1>
      </header>

      <ApprovalStatusPanel
        projectId={projectId}
        collectionId={collectionId}
        contentId={Number(contentId)}
        initialStatus={approvalStatus}
      />

      <ContentForm
        projectId={projectId}
        fields={collection.fields}
        siblings={siblings}
        initial={initial}
        submitLabel="Save"
        onSubmit={async (form) => {
          "use server";
          await updateContent(projectId, collectionId, Number(contentId), form);
        }}
      />
    </div>
  );
}
