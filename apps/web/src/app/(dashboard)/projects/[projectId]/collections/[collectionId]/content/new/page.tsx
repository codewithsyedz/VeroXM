import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { authOptions } from "@/lib/auth";
import ContentForm, { type FieldSchema, type SiblingCollection } from "../ContentForm";
import { createContent } from "../actions";

interface CollectionDetail {
  id: number;
  name: string;
  fields: FieldSchema[];
  project: { collections: SiblingCollection[] };
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

export default async function NewContentPage({
  params,
}: {
  params: Promise<{ projectId: string; collectionId: string }>;
}) {
  const { projectId, collectionId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.apiToken) redirect("/login");

  const collection = await getCollection(projectId, collectionId, session.apiToken);
  const siblings = collection.project.collections.filter((c) => c.id !== collection.id);

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
        <p className="eyebrow">New entry</p>
        <h1 className="mt-3 text-[30px] font-medium tracking-tight text-[#f2f3fb]">
          New {collection.name}
        </h1>
      </header>

      <ContentForm
        projectId={projectId}
        fields={collection.fields}
        siblings={siblings}
        initial={{ data: {} }}
        submitLabel="Create"
        onSubmit={async (form) => {
          "use server";
          await createContent(projectId, collectionId, form);
        }}
      />
    </div>
  );
}
