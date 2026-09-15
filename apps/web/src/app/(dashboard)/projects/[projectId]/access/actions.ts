"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";

async function apiToken() {
  const session = await getServerSession(authOptions);
  if (!session?.apiToken) {
    throw new Error("Not authenticated");
  }
  return session.apiToken;
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const token = await apiToken();
  const res = await fetch(`${process.env.API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    // NestJS's default HttpException shape is {statusCode, message, error} --
    // not {errors} -- so this was previously swallowing every real backend
    // error message (validation failures, ConflictException text, etc.)
    // behind a generic "Request failed (500)". Surface whichever shape the
    // response actually used.
    const message = body?.errors
      ? JSON.stringify(body.errors)
      : body?.message
        ? Array.isArray(body.message)
          ? body.message.join(", ")
          : String(body.message)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return res.status === 204 ? null : res.json();
}

export async function issueApiToken(projectId: string, name: string, abilities: string[]) {
  const token = await apiFetch(`/projects/${projectId}/tokens`, {
    method: "POST",
    body: JSON.stringify({ name, abilities }),
  });
  revalidatePath(`/projects/${projectId}/access`);
  return token as { id: number; name: string; abilities: string[]; plainTextToken: string };
}

export async function revokeApiToken(projectId: string, tokenId: number) {
  await apiFetch(`/projects/${projectId}/tokens/${tokenId}`, {
    method: "DELETE",
  });
  revalidatePath(`/projects/${projectId}/access`);
}

// --- Authentication (username/password API users) -----------------------
// Manages ProjectApiUser credentials -- separate from the static API keys
// above, used by ProjectApiAuthController's login/refresh routes on the
// public API itself (see ApiAuthUsersTab.tsx).

export async function createApiAuthUser(
  projectId: string,
  username: string,
  password: string,
  abilities: string[],
) {
  const user = await apiFetch(`/projects/${projectId}/api-users`, {
    method: "POST",
    body: JSON.stringify({ username, password, abilities }),
  });
  revalidatePath(`/projects/${projectId}/access`);
  return user as { id: number; username: string; abilities: string[]; createdAt: string | null };
}

export async function deleteApiAuthUser(projectId: string, id: number) {
  await apiFetch(`/projects/${projectId}/api-users/${id}`, {
    method: "DELETE",
  });
  revalidatePath(`/projects/${projectId}/access`);
}

// --- API Analytics ------------------------------------------------------
// All of this reads real rows in `api_request_logs`, written by
// ApiRequestLogMiddleware on every call to /public/v1 and /public/v2 (see
// docs/PHASE-7-NOTES.md) — nothing here is sample or placeholder data.

export type AnalyticsRange = "1h" | "24h" | "7d" | "30d";

export interface AnalyticsSummary {
  range: AnalyticsRange;
  since: string;
  totalRequests: number;
  successRate: number;
  avgResponseMs: number;
  failedRequests: number;
}

export interface DailyVolumePoint {
  date: string;
  count: number;
}

export interface EndpointBreakdownEntry {
  method: string;
  endpoint: string;
  count: number;
  avgResponseMs: number;
  errorCount: number;
}

export interface IpBreakdownEntry {
  ip: string;
  count: number;
  lastSeen: string;
}

export interface RequestLogEntry {
  id: number;
  apiVersion: string;
  method: string;
  path: string;
  endpoint: string;
  statusCode: number;
  durationMs: number;
  ip: string | null;
  createdAt: string;
}

export interface RequestLogPage {
  items: RequestLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export async function getAnalyticsSummary(projectId: string, range: AnalyticsRange) {
  return apiFetch(`/projects/${projectId}/analytics/summary?range=${range}`) as Promise<AnalyticsSummary>;
}

export async function getAnalyticsTimeseries(projectId: string, range: AnalyticsRange) {
  return apiFetch(
    `/projects/${projectId}/analytics/timeseries?range=${range}`,
  ) as Promise<DailyVolumePoint[]>;
}

export async function getAnalyticsEndpoints(projectId: string, range: AnalyticsRange) {
  return apiFetch(
    `/projects/${projectId}/analytics/endpoints?range=${range}`,
  ) as Promise<EndpointBreakdownEntry[]>;
}

export async function getAnalyticsIps(projectId: string, range: AnalyticsRange) {
  return apiFetch(`/projects/${projectId}/analytics/ips?range=${range}`) as Promise<IpBreakdownEntry[]>;
}

export async function getAnalyticsLogs(
  projectId: string,
  options: { limit?: number; offset?: number; method?: string; status?: string } = {},
) {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));
  if (options.method) params.set("method", options.method);
  if (options.status) params.set("status", options.status);
  return apiFetch(
    `/projects/${projectId}/analytics/logs?${params.toString()}`,
  ) as Promise<RequestLogPage>;
}

// --- API Explorer --------------------------------------------------------
// Proxies the call server-side rather than hitting the public API straight
// from the browser: it keeps the executed request on the same origin (no
// CORS setup needed for what's meant to be an external-facing API) and lets
// this action attach nothing the caller didn't type — the token used is
// always exactly what was pasted into the explorer, never this session's
// own dashboard credentials, so what you see here is exactly what an
// outside caller would get.
export interface ExplorerRequestInput {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  url: string;
  token: string;
  body?: string;
}

export interface ExplorerResponseResult {
  status: number;
  statusText: string;
  durationMs: number;
  headers: Record<string, string>;
  body: string;
}

export async function executeExplorerRequest(
  input: ExplorerRequestInput,
): Promise<ExplorerResponseResult> {
  const startedAt = Date.now();
  const init: RequestInit = {
    method: input.method,
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
    },
  };
  if (input.body && (input.method === "POST" || input.method === "PATCH")) {
    init.body = input.body;
  }

  // The URL shown in the UI (and baked into the generated code snippets) is
  // the externally-correct one — NEXTAUTH_URL, the gateway's published
  // address, exactly what a real caller outside Docker would use. But this
  // action itself runs server-side, inside the `web` container, where that
  // same "localhost:8080" resolves to the container's own loopback, not the
  // gateway — there's nothing listening there, so the fetch just fails.
  // Swap in API_URL (the internal Docker-network address of the `api`
  // container, which serves /public/v1 and /public/v2 directly) purely for
  // where this one request actually goes; the displayed URL never changes.
  const nextAuthUrl = process.env.NEXTAUTH_URL;
  const apiUrl = process.env.API_URL;
  const executableUrl =
    nextAuthUrl && apiUrl && input.url.startsWith(nextAuthUrl)
      ? apiUrl + input.url.slice(nextAuthUrl.length)
      : input.url;

  try {
    const res = await fetch(executableUrl, init);
    const durationMs = Date.now() - startedAt;
    const text = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let body = text;
    try {
      body = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // Not JSON — show the raw text as-is.
    }

    return { status: res.status, statusText: res.statusText, durationMs, headers, body };
  } catch (e) {
    // Node's fetch failures are almost always a generic "fetch failed"
    // TypeError with the real reason (ECONNREFUSED, DNS failure, etc.) on
    // `.cause`, not `.message` — surface both so a network-layer problem is
    // debuggable from the response panel itself, not just from container logs.
    const cause =
      e instanceof Error && e.cause instanceof Error
        ? `: ${e.cause.message}`
        : e instanceof Error && e.cause
          ? `: ${String(e.cause)}`
          : "";
    return {
      status: 0,
      statusText: "Request failed",
      durationMs: Date.now() - startedAt,
      headers: {},
      body: (e instanceof Error ? e.message : "Could not reach the API") + cause,
    };
  }
}

// --- SDK Docs -------------------------------------------------------------
// Real collections and real field definitions, fetched project-wide, so the
// snippets below reflect whatever content models actually exist rather than
// a canned example.

export interface DocCollection {
  id: number;
  name: string;
  slug: string;
  fields: Array<{
    id: number;
    type: string;
    label: string;
    name: string;
    options?: Record<string, unknown> | null;
    validations?: Record<string, unknown> | null;
  }>;
}

// --- Webhooks -------------------------------------------------------------
// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.1. Same apiFetch proxy
// pattern as everything else on this page -- the dashboard session's own
// JWT authorizes the call server-side, never a project token.

export interface WebhookItem {
  id: number;
  url: string;
  subscribedEvents: string[];
  enabled: boolean;
  createdAt: string | null;
}

export interface WebhookDeliveryItem {
  id: number;
  event: string;
  responseStatus: number | null;
  attempt: number;
  deliveredAt: string | null;
  failedAt: string | null;
  createdAt: string | null;
}

export async function getWebhooks(projectId: string): Promise<WebhookItem[]> {
  return apiFetch(`/projects/${projectId}/webhooks`) as Promise<WebhookItem[]>;
}

export async function createWebhook(
  projectId: string,
  url: string,
  subscribedEvents: string[],
): Promise<WebhookItem & { secret: string }> {
  const webhook = await apiFetch(`/projects/${projectId}/webhooks`, {
    method: "POST",
    body: JSON.stringify({ url, subscribedEvents }),
  });
  revalidatePath(`/projects/${projectId}/access`);
  return webhook as WebhookItem & { secret: string };
}

export async function updateWebhook(
  projectId: string,
  webhookId: number,
  patch: { url?: string; subscribedEvents?: string[]; enabled?: boolean },
): Promise<WebhookItem> {
  const webhook = await apiFetch(`/projects/${projectId}/webhooks/${webhookId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  revalidatePath(`/projects/${projectId}/access`);
  return webhook as WebhookItem;
}

export async function deleteWebhook(projectId: string, webhookId: number): Promise<void> {
  await apiFetch(`/projects/${projectId}/webhooks/${webhookId}`, { method: "DELETE" });
  revalidatePath(`/projects/${projectId}/access`);
}

export async function sendTestWebhook(projectId: string, webhookId: number): Promise<void> {
  await apiFetch(`/projects/${projectId}/webhooks/${webhookId}/test`, { method: "POST" });
}

export async function getWebhookDeliveries(
  projectId: string,
  webhookId: number,
): Promise<WebhookDeliveryItem[]> {
  return apiFetch(
    `/projects/${projectId}/webhooks/${webhookId}/deliveries`,
  ) as Promise<WebhookDeliveryItem[]>;
}

export async function getCollectionsWithFields(projectId: string): Promise<DocCollection[]> {
  const summaries = (await apiFetch(`/projects/${projectId}/collections`)) as Array<{
    id: number;
    name: string;
    slug: string;
  }>;

  const detailed = await Promise.all(
    summaries.map((c) =>
      apiFetch(`/projects/${projectId}/collections/${c.id}`) as Promise<DocCollection>,
    ),
  );

  return detailed;
}
