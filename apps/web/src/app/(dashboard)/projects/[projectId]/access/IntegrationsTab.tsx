"use client";

import { useState, useTransition } from "react";
import { CloudCog, ShieldCheck, Trash2 } from "lucide-react";
import InlineAlert from "@/components/InlineAlert";
import { deleteCdnPurgeConfig, saveCdnPurgeConfig, type CdnPurgeConfigItem } from "./actions";

// docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §4.1 -- the dashboard
// side of the "reference integration proving the pattern end-to-end" for
// the read-path cache work: a project's CDN gets purged automatically on
// content.published/updated/deleted, the same events the read-cache
// invalidation listener and the webhook engine both key off of. Only
// Cloudflare is wired up server-side today (CdnPurgeProcessor) -- the
// provider field below is a fixed single option on purpose, not a cut
// corner in this form specifically.
//
// One row per project, not a list like Webhooks -- this is a settings
// form (get/upsert/delete), not a CRUD table.

export default function IntegrationsTab({
  projectId,
  initialConfig,
}: {
  projectId: string;
  initialConfig: CdnPurgeConfigItem | null;
}) {
  const [config, setConfig] = useState(initialConfig);
  const [zoneId, setZoneId] = useState(initialConfig?.zoneId ?? "");
  const [apiToken, setApiToken] = useState("");
  const [enabled, setEnabled] = useState(initialConfig?.enabled ?? true);
  const [isPending, startTransition] = useTransition();
  const [alert, setAlert] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  function handleSave() {
    setAlert(null);
    startTransition(async () => {
      try {
        const saved = await saveCdnPurgeConfig(projectId, {
          provider: "cloudflare",
          zoneId,
          apiToken: apiToken.trim() || undefined,
          enabled,
        });
        setConfig(saved);
        setApiToken("");
        setAlert({ tone: "success", message: "CDN purge configuration saved." });
      } catch (err) {
        setAlert({ tone: "error", message: err instanceof Error ? err.message : "Failed to save" });
      }
    });
  }

  function handleRemove() {
    setAlert(null);
    startTransition(async () => {
      try {
        await deleteCdnPurgeConfig(projectId);
        setConfig(null);
        setZoneId("");
        setApiToken("");
        setEnabled(true);
        setAlert({ tone: "success", message: "CDN purge configuration removed.", });
      } catch (err) {
        setAlert({ tone: "error", message: err instanceof Error ? err.message : "Failed to remove" });
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="surface-feature rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <div className="icon-button h-9 w-9 shrink-0 cursor-default">
            <CloudCog className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-medium text-[#f2f3fb]">CDN purge (Cloudflare)</h2>
            <p className="mt-1 text-[13px] leading-5 text-[#7680a3]">
              Automatically purges this project&apos;s Cloudflare zone whenever content is published,
              updated, or deleted — the same events that drive the webhook engine and the public API&apos;s
              read-path cache. Purges are queued and retried with backoff, not fired inline on the request
              that triggered them.
            </p>
          </div>
        </div>

        {alert && (
          <div className="mt-4">
            <InlineAlert tone={alert.tone} message={alert.message} onDismiss={() => setAlert(null)} autoDismissMs={alert.tone === "success" ? 4000 : undefined} />
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[#b8bfd8]">
            Zone ID
            <input
              type="text"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              placeholder="023e105f4ecef8ad9ca31a8372d0c353"
              className="input-quiet h-10 px-3 text-sm font-mono-code"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[#b8bfd8]">
            API token {config?.hasApiToken && <span className="text-[#7680a3]">(leave blank to keep the current one)</span>}
            <input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={config?.hasApiToken ? "••••••••••••" : "Cloudflare API token"}
              className="input-quiet h-10 px-3 text-sm font-mono-code"
            />
          </label>
        </div>

        <label className="mt-4 flex items-center gap-2.5 text-sm text-[#b8bfd8]">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-transparent"
          />
          Purge automatically on content changes
        </label>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || !zoneId.trim() || (!config?.hasApiToken && !apiToken.trim())}
            className="button-primary px-4"
          >
            {config ? "Save changes" : "Enable CDN purge"}
          </button>
          {config && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isPending}
              className="button-secondary flex items-center gap-1.5 px-3 text-xs text-[#ea6d76]"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Remove
            </button>
          )}
        </div>

        {config && (
          <div className="surface-inset mt-5 flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-[#7680a3]">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Configured{config.enabled ? "" : " (currently disabled)"} — last updated{" "}
            {config.updatedAt ? new Date(config.updatedAt).toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" }) : "just now"}.
          </div>
        )}
      </div>
    </div>
  );
}
