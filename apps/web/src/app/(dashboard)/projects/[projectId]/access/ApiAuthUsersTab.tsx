"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { ABILITY_OPTIONS, abilityLabel, type Ability } from "@/lib/abilities";
import { createApiAuthUser, deleteApiAuthUser } from "./actions";

export interface ApiAuthUserItem {
  id: number;
  username: string;
  abilities: string[];
  createdAt: string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  // Pinned locale + timeZone, same server/client hydration fix as
  // AccessTokens.tsx's own formatDate.
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function CreateApiUserModal({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: (user: ApiAuthUserItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
    // Reset every time it's reopened -- matches IssueTokenModal's own
    // convention in AccessTokens.tsx.
    setUsername("");
    setPassword("");
    setAbilities(["read"]);
    setError(null);
    setOpen(true);
  }

  function toggleAbility(ability: Ability) {
    setAbilities((prev) =>
      prev.includes(ability) ? prev.filter((a) => a !== ability) : [...prev, ability],
    );
  }

  const canSubmit = username.trim().length > 0 && password.length >= 8 && abilities.length > 0;

  function submit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        const user = await createApiAuthUser(projectId, username.trim(), password, abilities);
        onCreated(user);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create credential");
      }
    });
  }

  return (
    <>
      <button type="button" onClick={openModal} className="button-primary px-4">
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add credential
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Create API credential"
            className="surface-standard w-full max-w-md rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-medium text-[#f2f3fb]">Create API credential</h2>
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
                <span className="text-sm font-medium text-[#f2f3fb]">Username</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. mobile-app"
                  className="input-quiet h-10 px-3 text-sm"
                  autoFocus
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[#f2f3fb]">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="input-quiet h-10 px-3 text-sm"
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
                    Choose at least one permission for this credential.
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
                disabled={isPending || !canSubmit}
                onClick={submit}
                className="button-primary px-4"
              >
                {isPending ? "Working…" : "Create credential"}
              </button>
            </div>

            {error && <p className="mt-3 text-xs text-[#ea6d76]">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}

export default function ApiAuthUsersTab({
  projectId,
  endpoint,
  initialApiUsers,
}: {
  projectId: string;
  endpoint: string;
  initialApiUsers: ApiAuthUserItem[];
}) {
  const [users, setUsers] = useState(initialApiUsers);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreated(user: ApiAuthUserItem) {
    setUsers((prev) => [user, ...prev]);
  }

  function handleRemove(id: number) {
    setError(null);
    startTransition(async () => {
      try {
        await deleteApiAuthUser(projectId, id);
        setUsers((prev) => prev.filter((u) => u.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete credential");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="surface-feature rounded-2xl p-6">
        <p className="eyebrow">Login flow</p>
        <h2 className="mt-2 text-lg font-medium text-[#f2f3fb]">Username &amp; password authentication</h2>
        <p className="mt-2 text-sm leading-6 text-[#b8bfd8]">
          An alternative to pasting a static API key: create a username/password credential below,
          then have your client exchange it for a short-lived access token (1 hour) plus a refresh
          token (30 days) it can use to get a new access token without logging in again.
        </p>
        <div className="surface-inset mt-4 rounded-lg p-4">
          <p className="text-[11px] uppercase tracking-wide text-[#7680a3]">Log in</p>
          <pre className="mt-1 overflow-x-auto font-mono-code text-[11px] leading-5 text-[#b8bfd8]">
{`curl -X POST '${endpoint}/auth/token' \\
  -H 'Content-Type: application/json' \\
  -d '{"username":"YOUR_USERNAME","password":"YOUR_PASSWORD"}'`}
          </pre>
          <p className="mt-4 text-[11px] uppercase tracking-wide text-[#7680a3]">Refresh</p>
          <pre className="mt-1 overflow-x-auto font-mono-code text-[11px] leading-5 text-[#b8bfd8]">
{`curl -X POST '${endpoint}/auth/refresh' \\
  -H 'Content-Type: application/json' \\
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'`}
          </pre>
          <p className="mt-3 text-xs text-[#7680a3]">
            Both return <span className="font-mono-code">accessToken</span>,{" "}
            <span className="font-mono-code">refreshToken</span>, and{" "}
            <span className="font-mono-code">expiresIn</span> (seconds) — send the access token the
            same way as a static key:{" "}
            <span className="font-mono-code">Authorization: Bearer ACCESS_TOKEN</span>.
          </p>
        </div>
      </div>

      <div className="surface-standard rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Credentials</p>
            <h2 className="mt-2 text-lg font-medium text-[#f2f3fb]">API users</h2>
          </div>
          <CreateApiUserModal projectId={projectId} onCreated={handleCreated} />
        </div>

        {error && <p className="mt-3 text-xs text-[#ea6d76]">{error}</p>}

        {users.length === 0 ? (
          <p className="mt-6 text-sm text-[#b8bfd8]">No API users yet for this project.</p>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {users.map((user) => (
              <div
                key={user.id}
                className="surface-inset flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-4 w-4 text-[#7680a3]" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-[#f2f3fb]">{user.username}</p>
                    <p className="mt-0.5 text-[11px] text-[#7680a3]">
                      Created {formatDate(user.createdAt)} · {abilityLabel(user.abilities)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(user.id)}
                  disabled={isPending}
                  className="icon-button text-[#ea6d76] disabled:text-[#7680a3]"
                  aria-label="Delete credential"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
