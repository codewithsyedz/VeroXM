"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Download, KeyRound, Plus, Trash2, X } from "lucide-react";
import InlineAlert from "@/components/InlineAlert";
import { issueApiToken, revokeApiToken, type DocCollection } from "./actions";
import { buildPostmanCollection } from "@/lib/postman-collection";
import { ABILITY_OPTIONS, abilityLabel, type Ability } from "@/lib/abilities";

// The four Sanctum-style abilities the public API's guards actually check
// (see apps/api/src/public-api/require-ability.decorator.ts and
// PublicApiAuthService.can()) -- read/create/update/delete, or "*" for
// full access; ABILITY_OPTIONS/abilityLabel now live in lib/abilities.ts,
// shared with ApiAuthUsersTab.tsx's username/password credentials, which
// mint the exact same four abilities. A token issued with none of these
// checked would silently fall back to "*" server-side (ApiTokensService
// .issue's own default for an empty abilities array), so the modal below
// never lets "Create Token" submit with zero boxes ticked -- that footgun
// is closed in the UI, not left for the backend default to paper over.

export interface ApiTokenItem {
  id: number;
  name: string;
  abilities: string[];
  lastUsedAt: string | null;
  createdAt: string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  // Pinned locale + timeZone, matching the fix in lib/format.ts -- this is
  // also a client component, so an implicit local timezone here hits the
  // exact same server/client hydration mismatch.
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function slugForFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
}

function downloadPostmanCollection(options: {
  projectName: string;
  uuid: string;
  endpointV1: string;
  endpointV2: string;
  collections: DocCollection[];
}) {
  const collection = buildPostmanCollection({
    projectName: options.projectName,
    uuid: options.uuid,
    endpointV1Base: options.endpointV1,
    endpointV2Base: options.endpointV2,
    collections: options.collections,
  });

  const blob = new Blob([JSON.stringify(collection, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugForFilename(options.projectName)}-postman-collection.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function IssueTokenModal({
  projectId,
  onIssued,
}: {
  projectId: string;
  onIssued: (token: { id: number; name: string; abilities: string[]; plainTextToken: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [abilities, setAbilities] = useState<Ability[]>(["read"]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function openModal() {
    // Reset every time it's reopened, matching EditProjectModal's own
    // convention -- a half-filled form from a cancelled attempt shouldn't
    // reappear next time.
    setName("");
    setAbilities(["read"]);
    setError(null);
    setOpen(true);
  }

  function toggleAbility(ability: Ability) {
    setAbilities((prev) =>
      prev.includes(ability) ? prev.filter((a) => a !== ability) : [...prev, ability],
    );
  }

  function submit() {
    if (!name.trim() || abilities.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        const token = await issueApiToken(projectId, name.trim(), abilities);
        onIssued(token);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to issue key");
      }
    });
  }

  return (
    <>
      <button type="button" onClick={openModal} className="button-primary px-4">
        <Plus className="h-4 w-4" aria-hidden="true" />
        Issue key
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Create New Token"
            className="surface-standard w-full max-w-md rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-medium text-[#f2f3fb]">Create New Token</h2>
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
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[#f2f3fb]">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Key name"
                  className="input-quiet h-10 px-3 text-sm"
                  autoFocus
                />
              </label>

              <div>
                <span className="text-sm font-medium text-[#f2f3fb]">Permissions</span>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {ABILITY_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="surface-inset flex items-start gap-2.5 rounded-lg p-3"
                    >
                      <input
                        type="checkbox"
                        checked={abilities.includes(option.value)}
                        onChange={() => toggleAbility(option.value)}
                        className="mt-0.5 h-3.5 w-3.5"
                      />
                      <span>
                        <span className="block text-sm text-[#f2f3fb]">{option.label}</span>
                        <span className="block text-xs text-[#7680a3]">{option.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {abilities.length === 0 && (
                  <p className="mt-2 text-xs text-[#ea6d76]">
                    Choose at least one permission for this key.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="button-secondary px-4">
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || !name.trim() || abilities.length === 0}
                onClick={submit}
                className="button-primary px-4"
              >
                {isPending ? "Working…" : "Create Token"}
              </button>
            </div>

            {error && <p className="mt-3 text-xs text-[#ea6d76]">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access denied — nothing sensible to do beyond leaving
      // the value visible for the user to select manually.
    }
  }

  return (
    <button type="button" onClick={copy} className="icon-button" aria-label="Copy">
      {copied ? <Check className="h-4 w-4 text-[#4da3ff]" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function ConnectionInfo({ uuid, endpoint }: { uuid: string; endpoint: string }) {
  return (
    <div className="surface-feature rounded-2xl p-6">
      <p className="eyebrow">Connection</p>
      <h2 className="mt-2 text-lg font-medium text-[#f2f3fb]">Project API endpoint</h2>
      <p className="mt-2 text-sm leading-6 text-[#b8bfd8]">
        Use this base URL and a project token to read and write content through the public API.
      </p>

      <div className="mt-5 flex flex-col gap-3">
        <div className="surface-inset flex items-center justify-between gap-3 rounded-lg px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-[#7680a3]">Endpoint</p>
            <p className="truncate font-mono-code text-sm text-[#f2f3fb]">{endpoint}</p>
          </div>
          <CopyButton value={endpoint} />
        </div>

        <div className="surface-inset flex items-center justify-between gap-3 rounded-lg px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-[#7680a3]">Project UUID</p>
            <p className="truncate font-mono-code text-sm text-[#f2f3fb]">{uuid}</p>
          </div>
          <CopyButton value={uuid} />
        </div>
      </div>
    </div>
  );
}

function IssuedTokenReveal({
  token,
  onDismiss,
}: {
  token: { name: string; plainTextToken: string };
  onDismiss: () => void;
}) {
  return (
    <div className="surface-feature rounded-2xl p-6">
      <p className="eyebrow">New key issued</p>
      <h2 className="mt-2 text-lg font-medium text-[#f2f3fb]">{token.name}</h2>
      <p className="mt-2 text-sm leading-6 text-[#b8bfd8]">
        Copy this key now — it won&apos;t be shown again. If you lose it, revoke it here and
        issue a new one.
      </p>
      <div className="surface-inset mt-4 flex items-center justify-between gap-3 rounded-lg px-3 py-2.5">
        <p className="truncate font-mono-code text-sm text-[#f2f3fb]">{token.plainTextToken}</p>
        <CopyButton value={token.plainTextToken} />
      </div>
      <button type="button" onClick={onDismiss} className="button-secondary mt-4 px-4">
        Done
      </button>
    </div>
  );
}

export default function AccessTokens({
  projectId,
  projectName,
  uuid,
  endpoint,
  endpointV1,
  initialTokens,
  collections,
}: {
  projectId: string;
  projectName: string;
  uuid: string;
  endpoint: string;
  endpointV1: string;
  initialTokens: ApiTokenItem[];
  collections: DocCollection[];
}) {
  const [tokens, setTokens] = useState(initialTokens);
  const [issued, setIssued] = useState<{ name: string; plainTextToken: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // A revoke is instant and irreversible -- anything still using this key
  // stops working the moment it's confirmed -- so a bare click on the trash
  // icon only arms a row-level confirmation instead of revoking directly;
  // the actual revokeApiToken call only fires from the "Revoke key" button
  // that appears once armed. Only one row confirms at a time.
  const [confirmingRevokeId, setConfirmingRevokeId] = useState<number | null>(null);

  function handleIssued(token: { id: number; name: string; abilities: string[]; plainTextToken: string }) {
    setTokens((prev) => [
      { id: token.id, name: token.name, abilities: token.abilities, lastUsedAt: null, createdAt: new Date().toISOString() },
      ...prev,
    ]);
    setIssued({ name: token.name, plainTextToken: token.plainTextToken });
  }

  function handleRevoke(id: number) {
    setError(null);
    startTransition(async () => {
      try {
        await revokeApiToken(projectId, id);
        setTokens((prev) => prev.filter((t) => t.id !== id));
        setConfirmingRevokeId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to revoke key");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Side by side above the lg breakpoint -- each card's own content is
          naturally narrow (a couple of label/value rows; a short blurb and
          a button), so letting either stretch alone to the full page width
          just spreads that content out into empty space. Two columns use
          the width the page actually gives this tab. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <ConnectionInfo uuid={uuid} endpoint={endpoint} />

        <div className="surface-standard flex h-full flex-col justify-between gap-4 rounded-2xl p-6">
          <div>
            <p className="eyebrow">Export</p>
            <h2 className="mt-2 text-lg font-medium text-[#f2f3fb]">Postman collection</h2>
            <p className="mt-2 text-sm leading-6 text-[#b8bfd8]">
              Every v1 and v2 route for this project&apos;s real content models, grouped into GET /
              POST / PATCH / DELETE folders, ready to import — includes a Login request (Auth
              folder) that fills in the collection&apos;s
              <span className="font-mono-code"> apiKey </span>
              variable automatically if you&apos;ve set up a username/password credential on the
              Authentication tab, or paste a static key into that variable yourself.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              downloadPostmanCollection({
                projectName,
                uuid,
                endpointV1,
                endpointV2: endpoint,
                collections,
              })
            }
            className="button-secondary w-fit px-4"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download Postman Collection
          </button>
        </div>
      </div>

      {issued && <IssuedTokenReveal token={issued} onDismiss={() => setIssued(null)} />}

      <div className="surface-standard rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Application keys</p>
            <h2 className="mt-2 text-lg font-medium text-[#f2f3fb]">API tokens</h2>
          </div>
          <IssueTokenModal projectId={projectId} onIssued={handleIssued} />
        </div>

        {error && (
          <div className="mt-3">
            <InlineAlert tone="error" message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        {tokens.length === 0 ? (
          <p className="mt-6 text-sm text-[#b8bfd8]">No API keys yet for this project.</p>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {tokens.map((token) => {
              const confirming = confirmingRevokeId === token.id;
              return (
                <div
                  key={token.id}
                  className="surface-inset flex flex-col gap-3 rounded-lg px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <KeyRound className="h-4 w-4 text-[#7680a3]" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-medium text-[#f2f3fb]">{token.name}</p>
                        <p className="mt-0.5 text-[11px] text-[#7680a3]">
                          Created {formatDate(token.createdAt)} · Last used {formatDate(token.lastUsedAt)} ·{" "}
                          {abilityLabel(token.abilities)}
                        </p>
                      </div>
                    </div>
                    {!confirming && (
                      <button
                        type="button"
                        onClick={() => setConfirmingRevokeId(token.id)}
                        disabled={isPending}
                        className="icon-button text-[#ea6d76] disabled:text-[#7680a3]"
                        aria-label={`Revoke ${token.name}`}
                        title="Revoke"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {confirming && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgba(234,109,118,0.35)] bg-[rgba(234,109,118,0.08)] px-3 py-2.5">
                      <p className="text-xs text-[#ea6d76]">
                        Revoke <span className="font-medium">{token.name}</span>? Anything using
                        this key will stop working immediately.
                      </p>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmingRevokeId(null)}
                          disabled={isPending}
                          className="button-secondary px-3 text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevoke(token.id)}
                          disabled={isPending}
                          className="inline-flex h-8 items-center rounded-lg bg-[#ea6d76] px-3 text-xs font-medium text-white transition-colors hover:bg-[#d85c66] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isPending ? "Revoking…" : "Revoke key"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
