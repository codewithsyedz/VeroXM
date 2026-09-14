import { AlertTriangle, Clock, ListOrdered, TrendingUp } from "lucide-react";
import type {
  AnalyticsRange,
  AnalyticsSummary,
  DailyVolumePoint,
  EndpointBreakdownEntry,
  IpBreakdownEntry,
  RequestLogPage,
} from "./actions";

export type AnalyticsSub = "overview" | "logs" | "ips";

const RANGES: Array<{ id: AnalyticsRange; label: string }> = [
  { id: "1h", label: "Last hour" },
  { id: "24h", label: "24 hours" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
];

const SUBS: Array<{ id: AnalyticsSub; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "logs", label: "Detailed Logs" },
  { id: "ips", label: "IP Analytics" },
];

function baseHref(projectId: string, sub: AnalyticsSub, range: AnalyticsRange) {
  return `/projects/${projectId}/access?tab=analytics&sub=${sub}&range=${range}`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="surface-inset rounded-xl p-4">
      <div className="flex items-center gap-2 text-[#7680a3]">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <p
        className={`mt-2 text-2xl font-medium tracking-tight ${
          tone === "danger" ? "text-[#ea6d76]" : "text-[#f2f3fb]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function DailyVolumeChart({ points }: { points: DailyVolumePoint[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-[#7680a3]">No requests recorded in this range yet.</p>;
  }
  const max = Math.max(...points.map((p) => p.count), 1);
  return (
    <div className="flex h-40 items-end gap-1.5">
      {points.map((p) => (
        <div key={p.date} className="group relative flex-1">
          <div
            className="rounded-t bg-[rgba(77,163,255,0.55)] transition-colors group-hover:bg-[#4da3ff]"
            style={{ height: `${Math.max((p.count / max) * 100, 3)}%` }}
          />
          <div className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
            {p.date} · {p.count}
          </div>
        </div>
      ))}
    </div>
  );
}

function EndpointsTable({ endpoints }: { endpoints: EndpointBreakdownEntry[] }) {
  if (endpoints.length === 0) {
    return <p className="text-sm text-[#7680a3]">No endpoint traffic in this range yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[#7680a3]">
            <th className="pb-2 pr-4 font-medium">Endpoint</th>
            <th className="pb-2 pr-4 font-medium">Requests</th>
            <th className="pb-2 pr-4 font-medium">Avg response</th>
            <th className="pb-2 font-medium">Errors</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {endpoints.map((e) => (
            <tr key={`${e.method} ${e.endpoint}`}>
              <td className="py-2 pr-4">
                <span className="font-mono-code text-[11px] text-[#4da3ff]">{e.method}</span>{" "}
                <span className="font-mono-code text-[11px] text-[#b8bfd8]">{e.endpoint}</span>
              </td>
              <td className="py-2 pr-4 text-[#f2f3fb]">{e.count}</td>
              <td className="py-2 pr-4 text-[#b8bfd8]">{e.avgResponseMs} ms</td>
              <td className={`py-2 ${e.errorCount > 0 ? "text-[#ea6d76]" : "text-[#7680a3]"}`}>
                {e.errorCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function statusTone(status: number) {
  if (status >= 500) return "text-[#ea6d76]";
  if (status >= 400) return "text-[#e0a63d]";
  if (status >= 200) return "text-[#5fce8f]";
  return "text-[#b8bfd8]";
}

function LogsTable({
  projectId,
  range,
  page,
  method,
  status,
}: {
  projectId: string;
  range: AnalyticsRange;
  page: RequestLogPage;
  method?: string;
  status?: string;
}) {
  const methods = ["", "GET", "POST", "PATCH", "DELETE"];
  const statuses: Array<{ id: string; label: string }> = [
    { id: "", label: "All" },
    { id: "success", label: "Success" },
    { id: "error", label: "Error" },
  ];

  function href(overrides: { method?: string; status?: string; offset?: number }) {
    const params = new URLSearchParams({
      tab: "analytics",
      sub: "logs",
      range,
      method: overrides.method ?? method ?? "",
      status: overrides.status ?? status ?? "",
      offset: String(overrides.offset ?? page.offset),
    });
    return `/projects/${projectId}/access?${params.toString()}`;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-1.5">
          {statuses.map((s) => (
            <a
              key={s.id}
              href={href({ status: s.id, offset: 0 })}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                (status ?? "") === s.id
                  ? "bg-white/[0.08] text-[#f2f3fb]"
                  : "text-[#7680a3] hover:text-[#b8bfd8]"
              }`}
            >
              {s.label}
            </a>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {methods.map((m) => (
            <a
              key={m || "all"}
              href={href({ method: m, offset: 0 })}
              className={`rounded-lg px-2.5 py-1 font-mono-code text-xs font-medium ${
                (method ?? "") === m
                  ? "bg-white/[0.08] text-[#f2f3fb]"
                  : "text-[#7680a3] hover:text-[#b8bfd8]"
              }`}
            >
              {m || "All"}
            </a>
          ))}
        </div>
      </div>

      {page.items.length === 0 ? (
        <p className="text-sm text-[#7680a3]">No API calls match these filters yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[#7680a3]">
                <th className="pb-2 pr-4 font-medium">Time</th>
                <th className="pb-2 pr-4 font-medium">Method</th>
                <th className="pb-2 pr-4 font-medium">Path</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 font-medium">Duration</th>
                <th className="pb-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {page.items.map((entry) => (
                <tr key={entry.id}>
                  <td className="py-2 pr-4 whitespace-nowrap text-[#b8bfd8]">
                    {new Date(entry.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td className="py-2 pr-4 font-mono-code text-[11px] text-[#4da3ff]">
                    {entry.method}
                  </td>
                  <td className="py-2 pr-4 font-mono-code text-[11px] text-[#b8bfd8]">
                    {entry.path}
                  </td>
                  <td className={`py-2 pr-4 font-mono-code text-[11px] ${statusTone(entry.statusCode)}`}>
                    {entry.statusCode}
                  </td>
                  <td className="py-2 pr-4 text-[#b8bfd8]">{entry.durationMs} ms</td>
                  <td className="py-2 font-mono-code text-[11px] text-[#7680a3]">
                    {entry.ip ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-xs text-[#7680a3]">
        <span>
          {page.total === 0
            ? "0 calls"
            : `${page.offset + 1}–${Math.min(page.offset + page.limit, page.total)} of ${page.total}`}
        </span>
        <div className="flex gap-2">
          <a
            href={href({ offset: Math.max(page.offset - page.limit, 0) })}
            aria-disabled={page.offset === 0}
            className={`button-secondary px-3 py-1.5 ${page.offset === 0 ? "pointer-events-none opacity-40" : ""}`}
          >
            Previous
          </a>
          <a
            href={href({ offset: page.offset + page.limit })}
            aria-disabled={page.offset + page.limit >= page.total}
            className={`button-secondary px-3 py-1.5 ${
              page.offset + page.limit >= page.total ? "pointer-events-none opacity-40" : ""
            }`}
          >
            Next
          </a>
        </div>
      </div>
    </div>
  );
}

function IpsTable({ ips }: { ips: IpBreakdownEntry[] }) {
  if (ips.length === 0) {
    return <p className="text-sm text-[#7680a3]">No client IPs recorded in this range yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[#7680a3]">
            <th className="pb-2 pr-4 font-medium">IP address</th>
            <th className="pb-2 pr-4 font-medium">Requests</th>
            <th className="pb-2 font-medium">Last seen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {ips.map((ip) => (
            <tr key={ip.ip}>
              <td className="py-2 pr-4 font-mono-code text-[11px] text-[#f2f3fb]">{ip.ip}</td>
              <td className="py-2 pr-4 text-[#b8bfd8]">{ip.count}</td>
              <td className="py-2 text-[#7680a3]">{new Date(ip.lastSeen).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Reads only real rows from `api_request_logs` (see ApiRequestLogMiddleware,
// docs/PHASE-7-NOTES.md) — every count, chart bar and table row here comes
// from actual public-API traffic against this project, never sample data.
export default function ApiAnalyticsTab({
  projectId,
  sub,
  range,
  summary,
  timeseries,
  endpoints,
  ips,
  logsPage,
  logsMethod,
  logsStatus,
}: {
  projectId: string;
  sub: AnalyticsSub;
  range: AnalyticsRange;
  summary: AnalyticsSummary;
  timeseries?: DailyVolumePoint[];
  endpoints?: EndpointBreakdownEntry[];
  ips?: IpBreakdownEntry[];
  logsPage?: RequestLogPage;
  logsMethod?: string;
  logsStatus?: string;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {SUBS.map((s) => (
            <a
              key={s.id}
              href={baseHref(projectId, s.id, range)}
              aria-current={sub === s.id ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                sub === s.id
                  ? "bg-white/[0.08] text-[#f2f3fb]"
                  : "text-[#7680a3] hover:bg-white/[0.03] hover:text-[#b8bfd8]"
              }`}
            >
              {s.label}
            </a>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((r) => (
            <a
              key={r.id}
              href={baseHref(projectId, sub, r.id)}
              aria-current={range === r.id ? "page" : undefined}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                range === r.id
                  ? "bg-white/[0.08] text-[#f2f3fb]"
                  : "text-[#7680a3] hover:bg-white/[0.03] hover:text-[#b8bfd8]"
              }`}
            >
              {r.label}
            </a>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={TrendingUp} label="Total requests" value={String(summary.totalRequests)} />
        <StatCard
          icon={ListOrdered}
          label="Success rate"
          value={`${summary.successRate}%`}
        />
        <StatCard icon={Clock} label="Avg response" value={`${summary.avgResponseMs} ms`} />
        <StatCard
          icon={AlertTriangle}
          label="Failed requests"
          value={String(summary.failedRequests)}
          tone={summary.failedRequests > 0 ? "danger" : undefined}
        />
      </div>

      {sub === "overview" && (
        <>
          <div className="surface-standard rounded-2xl p-6">
            <h3 className="text-sm font-medium text-[#f2f3fb]">Daily request volume</h3>
            <div className="mt-4">
              <DailyVolumeChart points={timeseries ?? []} />
            </div>
          </div>
          <div className="surface-standard rounded-2xl p-6">
            <h3 className="text-sm font-medium text-[#f2f3fb]">Requests by endpoint</h3>
            <div className="mt-4">
              <EndpointsTable endpoints={endpoints ?? []} />
            </div>
          </div>
        </>
      )}

      {sub === "logs" && logsPage && (
        <div className="surface-standard rounded-2xl p-6">
          <h3 className="mb-4 text-sm font-medium text-[#f2f3fb]">Recent API calls</h3>
          <LogsTable
            projectId={projectId}
            range={range}
            page={logsPage}
            method={logsMethod}
            status={logsStatus}
          />
        </div>
      )}

      {sub === "ips" && (
        <div className="surface-standard rounded-2xl p-6">
          <h3 className="mb-4 text-sm font-medium text-[#f2f3fb]">Requests by IP address</h3>
          <IpsTable ips={ips ?? []} />
        </div>
      )}
    </div>
  );
}
