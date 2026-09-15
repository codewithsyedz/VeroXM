import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getProject } from "@/lib/get-project";
import AccessTokens, { type ApiTokenItem } from "./AccessTokens";
import ApiAuthUsersTab, { type ApiAuthUserItem } from "./ApiAuthUsersTab";
import DeveloperTabs, { DEFAULT_TAB, type DeveloperTab } from "./DeveloperTabs";
import ApiAnalyticsTab, { type AnalyticsSub } from "./ApiAnalyticsTab";
import ApiExplorerTab from "./ApiExplorerTab";
import SdkDocsTab from "./SdkDocsTab";
import WebhooksTab, { type WebhookItem } from "./WebhooksTab";
import {
  getAnalyticsEndpoints,
  getAnalyticsIps,
  getAnalyticsLogs,
  getAnalyticsSummary,
  getAnalyticsTimeseries,
  getCollectionsWithFields,
  getWebhooks,
  type AnalyticsRange,
} from "./actions";

async function getTokens(projectId: string, apiToken: string): Promise<ApiTokenItem[]> {
  const res = await fetch(`${process.env.API_URL}/projects/${projectId}/tokens`, {
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Tokens API responded ${res.status}`);
  }

  return res.json();
}

async function getApiUsers(projectId: string, apiToken: string): Promise<ApiAuthUserItem[]> {
  const res = await fetch(`${process.env.API_URL}/projects/${projectId}/api-users`, {
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`API users endpoint responded ${res.status}`);
  }

  return res.json();
}

const VALID_TABS: DeveloperTab[] = ["keys", "auth", "webhooks", "analytics", "explorer", "docs"];
const VALID_RANGES: AnalyticsRange[] = ["1h", "24h", "7d", "30d"];
const VALID_SUBS: AnalyticsSub[] = ["overview", "logs", "ips"];

export default async function ProjectAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    tab?: string;
    sub?: string;
    range?: string;
    method?: string;
    status?: string;
    offset?: string;
  }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const activeTab: DeveloperTab = VALID_TABS.includes(sp.tab as DeveloperTab)
    ? (sp.tab as DeveloperTab)
    : DEFAULT_TAB;
  const sub: AnalyticsSub = VALID_SUBS.includes(sp.sub as AnalyticsSub)
    ? (sp.sub as AnalyticsSub)
    : "overview";
  const range: AnalyticsRange = VALID_RANGES.includes(sp.range as AnalyticsRange)
    ? (sp.range as AnalyticsRange)
    : "7d";

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const [project, tokens] = session.apiToken
    ? await Promise.all([getProject(projectId, session.apiToken), getTokens(projectId, session.apiToken)])
    : [null, []];

  const apiUsers =
    activeTab === "auth" && session.apiToken ? await getApiUsers(projectId, session.apiToken) : [];

  const webhooks: WebhookItem[] = activeTab === "webhooks" ? await getWebhooks(projectId) : [];

  // NEXTAUTH_URL is this deployment's own public origin — reachable through
  // the same gateway that serves the app itself (docker-compose sets it to
  // the gateway's published port; in production it's the real domain). The
  // gateway's `/public/` location proxies straight to the NestJS api's own
  // `public/v2/...` routes (see docker/nginx/gateway.conf), so it's also the
  // correct base for anything a project token holder would call.
  const endpoint = `${process.env.NEXTAUTH_URL}/public/v2/projects/${project?.uuid ?? ""}`;

  // Same idea, one level down: the v1 legacy compatibility shim mounted at
  // `/public/v1/:uuid` (see V1ContentController) — needed alongside the v2
  // base above so the Postman collection export (AccessTokens.tsx) can
  // cover both API generations this app actually exposes, not just the
  // current one.
  const endpointV1 = `${process.env.NEXTAUTH_URL}/public/v1/${project?.uuid ?? ""}`;

  // Tab-specific data is only fetched for the tab actually being viewed —
  // analytics does real DB aggregation, and the explorer/docs/keys tabs
  // need every collection's full field list (keys needs it too now, to
  // build the Postman collection export), neither of which is free.
  let summary = null;
  let timeseries = undefined;
  let endpoints = undefined;
  let ips = undefined;
  let logsPage = undefined;
  if (activeTab === "analytics") {
    summary = await getAnalyticsSummary(projectId, range);
    if (sub === "overview") {
      [timeseries, endpoints] = await Promise.all([
        getAnalyticsTimeseries(projectId, range),
        getAnalyticsEndpoints(projectId, range),
      ]);
    } else if (sub === "ips") {
      ips = await getAnalyticsIps(projectId, range);
    } else if (sub === "logs") {
      logsPage = await getAnalyticsLogs(projectId, {
        limit: 25,
        offset: sp.offset ? Number(sp.offset) : 0,
        method: sp.method || undefined,
        status: sp.status || undefined,
      });
    }
  }

  let collections: Awaited<ReturnType<typeof getCollectionsWithFields>> = [];
  if (activeTab === "explorer" || activeTab === "docs" || activeTab === "keys") {
    collections = await getCollectionsWithFields(projectId);
  }

  return (
    <div className="container py-12">
      <header className="flex flex-col gap-6 border-b border-white/[0.08] pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="eyebrow">{project?.name ?? "Project settings"}</p>
          <h1 className="mt-3 text-[32px] font-medium tracking-tight text-[#f2f3fb] sm:text-[38px]">
            Developer
          </h1>
          <p className="mt-3 text-[15px] leading-6 text-[#b8bfd8]">
            Keys, traffic analytics, a live request builder and endpoint reference for{" "}
            {project?.name ?? "this project"}&apos;s public API.
          </p>
        </div>
      </header>

      <div className="mt-8">
        <DeveloperTabs projectId={projectId} active={activeTab} />
      </div>

      {/* No max-w cap here (previously max-w-3xl, ~768px) -- .container
          already tops out at --db-content-max (1440px), same as every
          other dashboard page. The extra cap left a large empty gutter on
          anything wider than a laptop, most visible on this tab (a list of
          full-width cards with nothing else to fill the row) but applying
          equally to Analytics/Explorer/Docs, which want the room. */}
      <div className="mt-6">
        {activeTab === "keys" && (
          <AccessTokens
            projectId={projectId}
            projectName={project?.name ?? "Project"}
            uuid={project?.uuid ?? ""}
            endpoint={endpoint}
            endpointV1={endpointV1}
            initialTokens={tokens}
            collections={collections}
          />
        )}

        {activeTab === "auth" && (
          <ApiAuthUsersTab projectId={projectId} endpoint={endpoint} initialApiUsers={apiUsers} />
        )}

        {activeTab === "webhooks" && <WebhooksTab projectId={projectId} initialWebhooks={webhooks} />}

        {activeTab === "analytics" && summary && (
          <ApiAnalyticsTab
            projectId={projectId}
            sub={sub}
            range={range}
            summary={summary}
            timeseries={timeseries}
            endpoints={endpoints}
            ips={ips}
            logsPage={logsPage}
            logsMethod={sp.method}
            logsStatus={sp.status}
          />
        )}

        {activeTab === "explorer" && (
          <ApiExplorerTab endpointBase={endpoint} collections={collections} />
        )}

        {activeTab === "docs" && <SdkDocsTab endpointBase={endpoint} collections={collections} />}
      </div>
    </div>
  );
}
