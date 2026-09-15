"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Clock,
  Plus,
  Send,
  Trash2,
  Webhook as WebhookIcon,
  X,
  XCircle,
} from "lucide-react";
import InlineAlert from "@/components/InlineAlert";
import {
  createWebhook,
  deleteWebhook,
  getWebhookDeliveries,
  sendTestWebhook,
  updateWebhook,
  type WebhookDeliveryItem,
} from "./actions";

// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §3.1 -- the dashboard
// side of the webhook engine. Mirrors AccessTokens.tsx's own conventions
// closely (reveal-once secret, row-level delete confirmation) since a
// webhook's secret has the same "shown once, never again" handling as an
// API token's plaintext value.

export interface WebhookItem {
  id: number;
  url: string;
  subscribedEvents: string[];
  enabled: boolean;
  createdAt: string | null;
}

// Kept in sync by hand with WEBHOOK_EVENT_TYPES in
// apps/api/src/webhooks/webhooks.service.ts -- there are only four events
// today, so a small shared constant isn't worth a cross-package import for
// this first cut.
const EVENT_OPTIONS: Array<{ value: string; label: string; description: string }> = [
  {
    value: "content.published",
    label: "Content published",
    description: "A Draft entry becomes Published — from the dashboard or the public API.",
  },
  {
    value: "content.updated",
    label: "Content updated",
    description: "An existing entry is edited or republished.",
  },
  {
    value: "content.deleted",
    label: "Content deleted",
    description: "An entry is permanently removed.",
  },
  {
    value: "approval.requested",
    label: "Approval requested",
    description: "A publish attempt enters a configured approval workflow.",
  },
];

// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §4.3 -- "reference webhook
// consumers." Deliberately NOT a Slack/Teams-specific backend integration
// (no VeroXM-side code sends a Slack-shaped payload) -- every VeroXM
// webhook always POSTs the same signed `{event, data, sentAt}` JSON body
// regardless of recipe. What a preset actually changes here is: sensible
// default events for that destination, and an inline note on what stands
// between "paste a URL" and "see it in Slack/Teams" -- since both of those
// services expect their OWN payload shape (`{"text": "..."}` for Slack,
// an Adaptive Card for Teams), not this generic one. A thin relay (a
// thirty-second Zapier/Make "Catch Hook -> format message -> post to
// Slack" chain, or a few lines of code) is what actually bridges the two
// — same conclusion the recommendation doc's §4A reached for this whole
// class of integration ("customer configures a URL," not new VeroXM
// code), just spelled out here instead of left implicit.
export const WEBHOOK_RECIPES: Array<{
  id: string;
  label: string;
  defaultEvents: string[];
  note: string;
}> = [
  {
    id: "custom",
    label: "Custom / generic",
    defaultEvents: ["content.published"],
    note: "Point this at any endpoint that can accept a signed JSON POST — see the payload shape below.",
  },
  {
    id: "slack",
    label: "Slack",
    defaultEvents: ["content.published", "approval.requested"],
    note:
      'Slack\'s own Incoming Webhook URL expects {"text": "..."}, not this payload as-is — route through a small relay ' +
      '(a Zapier/Make "Catch Hook" step, or a few lines of code) that reads `event`/`data` below and posts a formatted ' +
      'Slack message. No Slack-specific code ships inside VeroXM; this is the wiring pattern, not a built-in integration.',
  },
  {
    id: "teams",
    label: "Microsoft Teams",
    defaultEvents: ["content.published", "approval.requested"],
    note:
      "Same idea as Slack: a Teams Incoming Webhook expects its own Adaptive Card JSON, so a small relay step reformats " +
      "this payload into that shape before forwarding it on.",
  },
];

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

function CreateWebhookModal({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: (webhook: WebhookItem & { secret: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [recipeId, setRecipeId] = useState<string>(WEBHOOK_RECIPES[0].id);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["content.published"]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const recipe = WEBHOOK_RECIPES.find((r) => r.id === recipeId) ?? WEBHOOK_RECIPES[0];

  function selectRecipe(id: string) {
    setRecipeId(id);
    const next = WEBHOOK_RECIPES.find((r) => r.id === id);
    if (next) setEvents(next.defaultEvents);
  }

  function openModal() {
    setUrl("");
    setRecipeId(WEBHOOK_RECIPES[0].id);
    setEvents(WEBHOOK_RECIPES[0].defaultEvents);
    setError(null);
    setOpen(true);
  }

  function toggleEvent(event: string) {
    setEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));
  }

  function submit() {
    if (!url.trim() || events.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        const webhook = await createWebhook(projectId, url.trim(), events);
        onCreated(webhook);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create webhook");
      }
    });
  }

  return (
    <>
      <button type="button" onClick={openModal} className="button-primary px-4">
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add webhook
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add webhook"
            className="surface-standard w-full max-w-md rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-medium text-[#f2f3fb]">Add webhook</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="icon-button h-8 w-8 shrink-0"
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6 flex flex-col gap-4">
              <div>
                <span className="text-sm font-medium text-[#f2f3fb]">Recipe</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {WEBHOOK_RECIPES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => selectRecipe(r.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        r.id === recipeId
                          ? "bg-white/[0.08] text-[#f2f3fb]"
                          : "surface-inset text-[#7680a3] hover:text-[#b8bfd8]"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                {recipe.id !== "custom" && (
                  <p className="surface-inset mt-2 rounded-lg p-3 text-xs leading-5 text-[#7680a3]">
                    {recipe.note}
                  </p>
                )}
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[#f2f3fb]">Endpoint URL</span>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/webhooks/veroxm"
                  className="input-quiet h-10 px-3 text-sm font-mono-code"
                  autoFocus
                />
              </label>

              <div>
                <span className="text-sm font-medium text-[#f2f3fb]">Events</span>
                <div className="mt-2 flex flex-col gap-2">
                  {EVENT_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="surface-inset flex items-start gap-2.5 rounded-lg p-3"
                    >
                      <input
                        type="checkbox"
                        checked={events.includes(option.value)}
                        onChange={() => toggleEvent(option.value)}
                        className="mt-0.5 h-3.5 w-3.5"
                      />
                      <span>
                        <span className="block font-mono-code text-sm text-[#f2f3fb]">
                          {option.label}
                        </span>
                        <span className="block text-xs text-[#7680a3]">{option.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {events.length === 0 && (
                  <p className="mt-2 text-xs text-[#ea6d76]">Choose at least one event.</p>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="button-secondary px-4">
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || !url.trim() || events.length === 0}
                onClick={submit}
                className="button-primary px-4"
              >
                {isPending ? "Working…" : "Add webhook"}
              </button>
            </div>

            {error && <p className="mt-3 text-xs text-[#ea6d76]">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}

function SecretReveal({ url, secret, onDismiss }: { url: string; secret: string; onDismiss: () => void }) {
  return (
    <div className="surface-feature rounded-2xl p-6">
      <p className="eyebrow">Webhook created</p>
      <h2 className="mt-2 truncate text-lg font-medium text-[#f2f3fb]">{url}</h2>
      <p className="mt-2 text-sm leading-6 text-[#b8bfd8]">
        Copy this signing secret now — it won&apos;t be shown again. Your endpoint uses it to verify
        the <span className="font-mono-code">X-VeroXM-Signature</span> header on every delivery (HMAC-SHA256
        over the raw request body).
      </p>
      <div className="surface-inset mt-4 flex items-center justify-between gap-3 rounded-lg px-3 py-2.5">
        <p className="truncate font-mono-code text-sm text-[#f2f3fb]">{secret}</p>
      </div>
      <button type="button" onClick={onDismiss} className="button-secondary mt-4 px-4">
        Done
      </button>
    </div>
  );
}

function DeliveryStatus({ delivery }: { delivery: WebhookDeliveryItem }) {
  if (delivery.deliveredAt) {
    return (
      <span className="inline-flex items-center gap-1 text-[#34d399]">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        {delivery.responseStatus}
      </span>
    );
  }
  if (delivery.failedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-[#ea6d76]">
        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
        {delivery.responseStatus ?? "No response"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[#7680a3]">
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      Pending
    </span>
  );
}

function WebhookCard({
  webhook,
  projectId,
  onUpdated,
  onRemoved,
}: {
  webhook: WebhookItem;
  projectId: string;
  onUpdated: (webhook: WebhookItem) => void;
  onRemoved: (id: number) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryItem[] | null>(null);
  const [loadingDeliveries, startLoadingDeliveries] = useTransition();
  const [testMessage, setTestMessage] = useState<string | null>(null);

  function loadDeliveries() {
    startLoadingDeliveries(async () => {
      try {
        const rows = await getWebhookDeliveries(projectId, webhook.id);
        setDeliveries(rows);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load delivery log");
      }
    });
  }

  function toggleEnabled() {
    setError(null);
    startTransition(async () => {
      try {
        const updated = await updateWebhook(projectId, webhook.id, { enabled: !webhook.enabled });
        onUpdated(updated);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update webhook");
      }
    });
  }

  function sendTest() {
    setError(null);
    setTestMessage(null);
    startTransition(async () => {
      try {
        await sendTestWebhook(projectId, webhook.id);
        setTestMessage("Test event sent.");
        loadDeliveries();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to send test event");
      }
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteWebhook(projectId, webhook.id);
        onRemoved(webhook.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete webhook");
      }
    });
  }

  return (
    <div className="surface-inset flex flex-col gap-3 rounded-lg px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <WebhookIcon
            className={`h-4 w-4 shrink-0 ${webhook.enabled ? "text-[#7680a3]" : "text-[#4a5170]"}`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="truncate font-mono-code text-sm font-medium text-[#f2f3fb]">{webhook.url}</p>
            <p className="mt-0.5 text-[11px] text-[#7680a3]">
              {webhook.subscribedEvents.join(", ")} · Created {formatDateTime(webhook.createdAt)}
              {!webhook.enabled && " · Disabled"}
            </p>
          </div>
        </div>

        {!confirmingDelete && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={sendTest}
              disabled={isPending}
              className="button-secondary h-8 px-3 text-xs"
              title="Send a test event"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              Test
            </button>
            <button
              type="button"
              onClick={toggleEnabled}
              disabled={isPending}
              className="button-secondary h-8 px-3 text-xs"
            >
              {webhook.enabled ? "Disable" : "Enable"}
            </button>
            <button
              type="button"
              onClick={() => (deliveries === null ? loadDeliveries() : setDeliveries(null))}
              disabled={loadingDeliveries}
              className="button-secondary h-8 px-3 text-xs"
            >
              {deliveries === null ? "View deliveries" : "Hide deliveries"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={isPending}
              className="icon-button text-[#ea6d76] disabled:text-[#7680a3]"
              aria-label={`Delete webhook to ${webhook.url}`}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {confirmingDelete && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgba(234,109,118,0.35)] bg-[rgba(234,109,118,0.08)] px-3 py-2.5">
          <p className="text-xs text-[#ea6d76]">
            Delete this webhook? Its delivery log goes with it and this can&apos;t be undone.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={isPending}
              className="button-secondary px-3 text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="inline-flex h-8 items-center rounded-lg bg-[#ea6d76] px-3 text-xs font-medium text-white transition-colors hover:bg-[#d85c66] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Deleting…" : "Delete webhook"}
            </button>
          </div>
        </div>
      )}

      {error && <InlineAlert tone="error" message={error} onDismiss={() => setError(null)} />}
      {testMessage && (
        <InlineAlert
          tone="success"
          message={testMessage}
          onDismiss={() => setTestMessage(null)}
          autoDismissMs={4000}
        />
      )}

      {deliveries !== null && (
        <div className="mt-1 overflow-x-auto rounded-lg border border-white/[0.06]">
          {deliveries.length === 0 ? (
            <p className="p-3 text-xs text-[#7680a3]">No deliveries yet.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[#7680a3]">
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Attempt</th>
                  <th className="px-3 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-t border-white/[0.06]">
                    <td className="px-3 py-2 font-mono-code text-[#f2f3fb]">{d.event}</td>
                    <td className="px-3 py-2">
                      <DeliveryStatus delivery={d} />
                    </td>
                    <td className="px-3 py-2 text-[#b8bfd8]">{d.attempt}</td>
                    <td className="px-3 py-2 text-[#b8bfd8]">{formatDateTime(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function WebhooksTab({
  projectId,
  initialWebhooks,
}: {
  projectId: string;
  initialWebhooks: WebhookItem[];
}) {
  const [webhooks, setWebhooks] = useState(initialWebhooks);
  const [secret, setSecret] = useState<{ url: string; secret: string } | null>(null);

  function handleCreated(webhook: WebhookItem & { secret: string }) {
    setWebhooks((prev) => [
      { id: webhook.id, url: webhook.url, subscribedEvents: webhook.subscribedEvents, enabled: webhook.enabled, createdAt: webhook.createdAt },
      ...prev,
    ]);
    setSecret({ url: webhook.url, secret: webhook.secret });
  }

  function handleUpdated(updated: WebhookItem) {
    setWebhooks((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
  }

  function handleRemoved(id: number) {
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="surface-standard rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <p className="eyebrow">Integrations</p>
            <h2 className="mt-2 text-lg font-medium text-[#f2f3fb]">Webhooks</h2>
            <p className="mt-2 text-sm leading-6 text-[#b8bfd8]">
              Get a signed HTTP POST whenever content changes in this project — point one at a CRM,
              Slack&apos;s Incoming Webhook URL, a search index, or your own endpoint. No third-party
              integration lives inside VeroXM itself; you configure where events go.
            </p>
          </div>
          <CreateWebhookModal projectId={projectId} onCreated={handleCreated} />
        </div>

        <details className="surface-inset mt-5 rounded-lg p-4 text-xs leading-5 text-[#7680a3]">
          <summary className="cursor-pointer select-none font-medium text-[#b8bfd8]">
            Payload shape &amp; recipes (Slack, Teams, custom)
          </summary>
          <p className="mt-3">
            Every delivery is a POST with a JSON body and two headers, regardless of which recipe you
            picked when creating the webhook:
          </p>
          <pre className="surface-standard mt-2 overflow-x-auto rounded-lg p-3 font-mono-code text-[11px] text-[#b8bfd8]">
{`POST <your URL>
x-veroxm-event: content.published
x-veroxm-signature: <hex HMAC-SHA256 of the body, using your webhook's secret>

{
  "event": "content.published",
  "data": { "projectId": 1, "contentId": 42, "collectionId": 3 },
  "sentAt": "2026-01-01T00:00:00.000Z"
}`}
          </pre>
          <p className="mt-3">
            Verify authenticity by recomputing that HMAC over the raw request body with your webhook&apos;s
            secret (shown once, at creation) and comparing it to <code className="font-mono-code">x-veroxm-signature</code>{" "}
            — never trust the payload alone. The <strong className="text-[#b8bfd8]">Slack</strong> and{" "}
            <strong className="text-[#b8bfd8]">Microsoft Teams</strong> recipes above set sensible default
            events for those destinations, but both services expect their own payload shape (Slack&apos;s{" "}
            <code className="font-mono-code">{`{"text": "..."}`}</code>, Teams&apos; Adaptive Cards) — route
            through a small relay (a Zapier/Make &quot;Catch Hook&quot; step, or a few lines of code) that
            reformats this JSON before forwarding it on. That relay is the only piece VeroXM doesn&apos;t ship
            for you; everything above it (signing, retries, the delivery log) is built in.
          </p>
        </details>

        {secret && (
          <div className="mt-6">
            <SecretReveal url={secret.url} secret={secret.secret} onDismiss={() => setSecret(null)} />
          </div>
        )}

        {webhooks.length === 0 ? (
          <p className="mt-6 text-sm text-[#b8bfd8]">No webhooks yet for this project.</p>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {webhooks.map((webhook) => (
              <WebhookCard
                key={webhook.id}
                webhook={webhook}
                projectId={projectId}
                onUpdated={handleUpdated}
                onRemoved={handleRemoved}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
