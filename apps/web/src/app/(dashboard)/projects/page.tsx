import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { formatRelative, pluralize } from "@/lib/format";
import { ArrowRight, Boxes, FileText, FolderOpen, Image as ImageIcon, KeyRound, Layers, Search } from "lucide-react";
import { LayoutTemplate } from "lucide-react";
import FlashBanner from "@/components/FlashBanner";
import CreateProjectPanel from "./CreateProjectPanel";
import EditProjectModal from "./EditProjectModal";
import ProjectStatusBadge from "./ProjectStatusBadge";
import TemplatesGrid from "./TemplatesGrid";

interface Project {
  id: number;
  uuid: string;
  name: string;
  description: string | null;
  defaultLocale: string;
  locales: string | null;
  slug: string | null;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  collectionCount: number;
  contentCount: number;
}

async function getProjects(
  apiToken: string,
  search?: string,
  status?: string,
): Promise<Project[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status && status !== "all") params.set("status", status);
  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${process.env.API_URL}/projects${query}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Projects API responded ${res.status}`);
  }

  return res.json();
}

const ENV_LABEL: Record<string, string> = { live: "Live", staging: "Staging" };

function apiEndpointFor(uuid: string) {
  // Same shape the Access page already computes and displays
  // (apps/web/.../access/page.tsx) — kept in sync with that rather than
  // invented separately, since this is the one real public API base a
  // project actually has.
  return `${process.env.NEXTAUTH_URL}/public/v2/projects/${uuid}`;
}

function ProjectMetaGrid({ project }: { project: Project }) {
  const endpoint = apiEndpointFor(project.uuid);
  return (
    <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3.5 text-xs">
      <div className="min-w-0">
        <dt className="text-[#7680a3]">Slug</dt>
        <dd className="mt-0.5 truncate font-mono-code text-[#b8bfd8]">{project.slug ?? "—"}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-[#7680a3]">Project ID</dt>
        <dd className="mt-0.5 font-mono-code text-[#b8bfd8]">{project.id}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-[#7680a3]">Environment</dt>
        <dd className="mt-0.5 text-[#b8bfd8]">{ENV_LABEL[project.status] ?? project.status}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-[#7680a3]">UUID</dt>
        <dd className="mt-0.5 truncate font-mono-code text-[#b8bfd8]" title={project.uuid}>
          {project.uuid}
        </dd>
      </div>
      <div className="col-span-2 min-w-0">
        <dt className="text-[#7680a3]">API Endpoint</dt>
        <dd className="mt-0.5 truncate font-mono-code text-[#b8bfd8]" title={endpoint}>
          {endpoint}
        </dd>
      </div>
    </dl>
  );
}

function statusHref(value: "all" | "live" | "staging", search: string) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (value !== "all") params.set("status", value);
  const qs = params.toString();
  return qs ? `/projects?${qs}` : "/projects";
}

const STATUS_PILLS = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "staging", label: "Staging" },
] as const;

function ProjectLinks({ projectId }: { projectId: number }) {
  const links = [
    { href: `/projects/${projectId}/collections`, label: "Model", icon: Boxes },
    { href: `/projects/${projectId}/content`, label: "Content", icon: FileText },
    { href: `/projects/${projectId}/media`, label: "Media", icon: ImageIcon },
    { href: `/projects/${projectId}/access`, label: "Developer", icon: KeyRound },
  ];

  return (
    <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-white/[0.07] pt-4">
      {links.map(({ href, label, icon: Icon }) => (
        <a
          key={href}
          href={href}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[#4da3ff] hover:text-white"
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </a>
      ))}
    </div>
  );
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const search = sp.search?.trim() ?? "";
  const status = sp.status === "live" || sp.status === "staging" ? sp.status : "all";
  const tab = sp.tab === "templates" ? "templates" : "my-projects";

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const projects =
    tab === "my-projects" && session.apiToken
      ? await getProjects(session.apiToken, search || undefined, status)
      : [];

  // Every number below is read off the rows the API returned — the counts
  // come from real grouped queries in ProjectsService.findAll, and "last
  // change" is the newest `updated_at` among them. Nothing here is a stand-in.
  const totalEntries = projects.reduce((sum, p) => sum + p.contentCount, 0);
  const totalCollections = projects.reduce((sum, p) => sum + p.collectionCount, 0);
  const lastChange = projects
    .map((p) => p.updatedAt)
    .filter((value): value is string => !!value)
    .sort()
    .at(-1);

  // The reference calls this slot "featured"; there's no such flag in the
  // schema, so it's the most recently touched project instead — a real
  // ordering, and it only makes sense when showing the full list.
  const recencyKey = (p: Project) => p.updatedAt ?? p.createdAt ?? "";
  const byRecency = [...projects].sort((a, b) => recencyKey(b).localeCompare(recencyKey(a)));
  const featured = search ? null : byRecency[0];
  const others = featured ? byRecency.filter((p) => p.id !== featured.id) : byRecency;

  return (
    <div className="container py-12">
      <div className="flex items-center gap-1 border-b border-white/[0.07]">
        <Link
          href="/projects"
          className={
            tab === "my-projects"
              ? "flex items-center gap-2 border-b-2 border-[#4da3ff] px-1 pb-3 text-sm font-medium text-[#f2f3fb]"
              : "flex items-center gap-2 border-b-2 border-transparent px-1 pb-3 text-sm font-medium text-[#7680a3] hover:text-[#b8bfd8]"
          }
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          My Projects
        </Link>
        <Link
          href="/projects?tab=templates"
          className={
            tab === "templates"
              ? "ml-4 flex items-center gap-2 border-b-2 border-[#4da3ff] px-1 pb-3 text-sm font-medium text-[#f2f3fb]"
              : "ml-4 flex items-center gap-2 border-b-2 border-transparent px-1 pb-3 text-sm font-medium text-[#7680a3] hover:text-[#b8bfd8]"
          }
        >
          <LayoutTemplate className="h-3.5 w-3.5" aria-hidden="true" />
          Templates
        </Link>
      </div>

      {tab === "templates" ? (
        <TemplatesGrid />
      ) : (
        <>
      <div className="mt-8 flex flex-wrap items-start justify-between gap-6">
        <header className="max-w-2xl">
          <p className="eyebrow">Publishing workspace</p>
          <h1 className="mt-3 text-[32px] font-medium leading-tight tracking-tight text-[#f2f3fb] sm:text-[38px]">
            Projects
          </h1>
          <p className="mt-3 text-[15px] leading-6 text-[#b8bfd8]">
            A clear view of the digital workspaces your team is shaping.
          </p>
        </header>

        <CreateProjectPanel />
      </div>

      <FlashBanner />

      <form method="get" action="/projects" className="mt-8 flex max-w-md items-center gap-2">
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <label className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7680a3]"
            aria-hidden="true"
          />
          <input
            type="search"
            name="search"
            defaultValue={search}
            placeholder="Search projects"
            aria-label="Search projects"
            className="input-quiet h-11 pl-9 pr-3 text-sm"
          />
        </label>
        <button type="submit" className="button-secondary px-4">
          Search
        </button>
      </form>

      <div className="mt-4 flex items-center gap-2">
        {STATUS_PILLS.map(({ value, label }) => {
          const active = status === value;
          return (
            <Link
              key={value}
              href={statusHref(value, search)}
              className={
                active
                  ? "rounded-full border border-white/[0.16] bg-white/[0.08] px-3 py-1 text-xs font-medium text-[#f2f3fb]"
                  : "rounded-full border border-white/[0.08] px-3 py-1 text-xs font-medium text-[#b8bfd8] hover:bg-white/[0.04]"
              }
            >
              {label}
            </Link>
          );
        })}
      </div>

      {(search || status !== "all") && (
        <p className="mt-4 text-sm text-[#b8bfd8]">
          {projects.length === 0
            ? search
              ? `No ${status === "all" ? "" : status + " "}projects match “${search}”.`
              : `No ${status} projects yet.`
            : search
              ? `${pluralize(projects.length, "project")} matching “${search}”.`
              : `${pluralize(projects.length, "project")}.`}{" "}
          <Link href="/projects" className="text-[#4da3ff] hover:text-white">
            Clear
          </Link>
        </p>
      )}

      {projects.length === 0 && !search && status === "all" ? (
        <section className="surface-standard mt-10 rounded-2xl p-10 text-center">
          <FolderOpen className="mx-auto h-6 w-6 text-[#7680a3]" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-medium text-[#f2f3fb]">No projects yet</h2>
          <p className="mt-2 text-sm text-[#b8bfd8]">
            Create your first project to get started.
          </p>
        </section>
      ) : (
        <>
          {featured && (
            <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
              <article className="surface-feature relative overflow-hidden rounded-2xl p-8">
                <div className="flex items-center justify-between gap-3">
                  <p className="eyebrow">Most recently updated</p>
                  <div className="flex items-center gap-1.5">
                    <ProjectStatusBadge projectId={featured.id} status={featured.status} />
                    <EditProjectModal project={featured} />
                  </div>
                </div>
                <h2 className="mt-3 text-[26px] font-medium tracking-tight text-[#f2f3fb]">
                  {featured.name}
                </h2>
                {featured.description && (
                  <p className="mt-3 max-w-xl text-[15px] leading-6 text-[#b8bfd8]">
                    {featured.description}
                  </p>
                )}

                <ProjectMetaGrid project={featured} />

                <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.09] pt-5">
                  <p className="font-mono-code text-[11px] text-[#7680a3]">
                    {pluralize(featured.collectionCount, "collection")} ·{" "}
                    {pluralize(featured.contentCount, "entry", "entries")} · Updated{" "}
                    {formatRelative(featured.updatedAt ?? featured.createdAt)}
                  </p>
                  <a
                    href={`/projects/${featured.id}/collections`}
                    className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-[#4da3ff] hover:text-white"
                  >
                    Open project
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                </div>
              </article>

              <aside className="surface-standard rounded-2xl p-6">
                <p className="eyebrow">Workspace health</p>
                <dl className="mt-5 flex flex-col">
                  {[
                    { label: "Active projects", value: String(projects.length) },
                    { label: "Collections", value: String(totalCollections) },
                    { label: "Content entries", value: String(totalEntries) },
                    { label: "Last workspace change", value: formatRelative(lastChange) },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between gap-4 border-b border-white/[0.06] py-3.5 last:border-b-0"
                    >
                      <dt className="text-sm text-[#b8bfd8]">{row.label}</dt>
                      <dd className="font-mono-code text-sm text-[#f2f3fb]">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </aside>
            </div>
          )}

          {others.length > 0 && (
            <>
              <div className="mt-12 flex items-baseline justify-between gap-4">
                <h2 className="text-sm font-medium text-[#f2f3fb]">
                  {featured ? "Other workspaces" : "Workspaces"}
                </h2>
                <span className="font-mono-code text-[11px] text-[#7680a3]">
                  {pluralize(others.length, "project")}
                </span>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {others.map((project) => (
                  <article key={project.id} className="surface-standard rounded-xl p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="eyebrow">{project.defaultLocale}</p>
                          <ProjectStatusBadge projectId={project.id} status={project.status} />
                          <EditProjectModal project={project} />
                        </div>
                        <h3 className="mt-2 truncate text-lg font-semibold tracking-tight text-[#f2f3fb]">
                          {project.name}
                        </h3>
                      </div>
                      <Layers className="h-4 w-4 shrink-0 text-[#7680a3]" aria-hidden="true" />
                    </div>

                    {project.description && (
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#b8bfd8]">
                        {project.description}
                      </p>
                    )}

                    <ProjectMetaGrid project={project} />

                    <div className="mt-6 flex flex-col gap-1 border-t border-white/[0.07] pt-4 font-mono-code text-[11px] text-[#7680a3]">
                      <span>
                        {pluralize(project.collectionCount, "collection")} ·{" "}
                        {pluralize(project.contentCount, "entry", "entries")}
                      </span>
                      <span>Updated {formatRelative(project.updatedAt ?? project.createdAt)}</span>
                    </div>

                    <ProjectLinks projectId={project.id} />
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}
        </>
      )}
    </div>
  );
}
