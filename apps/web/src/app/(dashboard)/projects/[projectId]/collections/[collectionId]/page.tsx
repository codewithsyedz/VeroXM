import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import type { FieldGroup, FieldItem, SiblingCollection } from "@/lib/fields";
import CollectionsSidebar, { type SidebarCollection } from "../CollectionsSidebar";
import CollectionHeader from "./CollectionHeader";
import CollectionTabs, { DEFAULT_TAB, type CollectionTab } from "./CollectionTabs";
import FieldsEditor from "./FieldsEditor";
import VisualPreviewTab from "./VisualPreviewTab";
import ValidationTab from "./ValidationTab";
import VersionsPanel from "./VersionsPanel";
import ComparisonPanel from "./ComparisonPanel";
import DependenciesTab from "./DependenciesTab";
import DocumentationTab from "./DocumentationTab";
import BlueprintsPanel from "./BlueprintsPanel";
import { getDependencies, listVersions, type CollectionVersion, type DependencyEntry } from "./actions";

interface CollectionDetail {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  options: { fieldGroups?: FieldGroup[] } | null;
  updatedAt: string | null;
  contentCount: number;
  fields: FieldItem[];
}

async function getCollections(projectId: string, apiToken: string): Promise<SidebarCollection[]> {
  const res = await fetch(`${process.env.API_URL}/projects/${projectId}/collections`, {
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Collections API responded ${res.status}`);
  return res.json();
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

const VALID_TABS: CollectionTab[] = [
  "fields",
  "preview",
  "validation",
  "versions",
  "comparison",
  "dependencies",
  "documentation",
  "blueprints",
];

export default async function CollectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; collectionId: string }>;
  searchParams: Promise<{ tab?: string; from?: string }>;
}) {
  const { projectId, collectionId } = await params;
  const sp = await searchParams;
  const activeTab: CollectionTab = VALID_TABS.includes(sp.tab as CollectionTab)
    ? (sp.tab as CollectionTab)
    : DEFAULT_TAB;

  const session = await getServerSession(authOptions);
  if (!session?.apiToken) {
    redirect("/login");
  }

  const [collections, collection] = await Promise.all([
    getCollections(projectId, session.apiToken),
    getCollection(projectId, collectionId, session.apiToken),
  ]);

  // Relation fields point at other collections in the same project; the
  // sidebar list already carries every one of them (with slugs, which the
  // contract generator needs), so it doubles as the sibling list.
  const siblings: SiblingCollection[] = collections
    .filter((c) => c.id !== collection.id)
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug }));

  // Tab-specific data is only fetched for the tab actually being viewed —
  // dependencies/versions both do real work server-side (a project-wide
  // field scan, and a DB round trip respectively), no reason to pay for
  // either on every load.
  let dependents: DependencyEntry[] = [];
  let versions: CollectionVersion[] = [];
  if (activeTab === "dependencies") {
    const result = await getDependencies(projectId, collectionId);
    dependents = result.dependents;
  }
  if (activeTab === "versions" || activeTab === "comparison") {
    versions = await listVersions(projectId, collectionId);
  }

  return (
    <div className="container py-12">
      <header className="max-w-2xl">
        <p className="eyebrow">Content model</p>
        <h1 className="mt-3 text-[32px] font-medium tracking-tight text-[#f2f3fb] sm:text-[38px]">
          Structure with clarity
        </h1>
        <p className="mt-3 text-[15px] leading-6 text-[#b8bfd8]">
          Define the shapes your content can take, then give editorial teams a model they can read.
        </p>
      </header>

      <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <CollectionsSidebar
          projectId={projectId}
          collections={collections}
          activeId={collection.id}
        />

        <div className="flex min-w-0 flex-col gap-5">
          <CollectionHeader
            projectId={projectId}
            collection={{
              id: collection.id,
              name: collection.name,
              slug: collection.slug,
              description: collection.description,
              updatedAt: collection.updatedAt,
              contentCount: collection.contentCount,
              fieldCount: collection.fields.length,
            }}
          />

          <CollectionTabs projectId={projectId} collectionId={collectionId} active={activeTab} />

          {activeTab === "fields" && (
            <FieldsEditor
              projectId={projectId}
              collectionId={collectionId}
              initialFields={collection.fields}
              initialOptions={collection.options}
              siblings={siblings}
            />
          )}

          {activeTab === "preview" && (
            <VisualPreviewTab
              projectId={projectId}
              fields={collection.fields}
              siblings={siblings}
            />
          )}

          {activeTab === "validation" && <ValidationTab fields={collection.fields} />}

          {activeTab === "versions" && (
            <VersionsPanel
              projectId={projectId}
              collectionId={collectionId}
              initialVersions={versions}
            />
          )}

          {activeTab === "comparison" && (
            <ComparisonPanel
              projectId={projectId}
              collectionId={collectionId}
              versions={versions}
              initialFromId={sp.from ? Number(sp.from) : undefined}
            />
          )}

          {activeTab === "dependencies" && (
            <DependenciesTab projectId={projectId} dependents={dependents} />
          )}

          {activeTab === "documentation" && (
            <DocumentationTab
              collectionName={collection.name}
              collectionSlug={collection.slug}
              description={collection.description}
              fields={collection.fields}
              siblings={siblings}
            />
          )}

          {activeTab === "blueprints" && (
            <BlueprintsPanel
              projectId={projectId}
              collectionId={collectionId}
              existingFieldNames={collection.fields.map((f) => f.name)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
