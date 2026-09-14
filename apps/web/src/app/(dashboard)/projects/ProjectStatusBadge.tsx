"use client";

import { useState, useTransition } from "react";
import { setProjectStatus } from "./actions";

const LABEL: Record<string, string> = { live: "Live", staging: "Staging" };

// A click flips the project's status via the new admin-tier
// PATCH /projects/:id/status endpoint. There's no per-project role
// exposed to this list view, so a non-admin's click simply comes back as
// an error from the server action — shown inline rather than silently
// reverting, since that's the honest outcome (see docs/PHASE-6-NOTES.md).
export default function ProjectStatusBadge({
  projectId,
  status,
}: {
  projectId: number;
  status: string;
}) {
  const [current, setCurrent] = useState(status);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = current === "live" ? "staging" : "live";
    setError(null);
    startTransition(async () => {
      try {
        await setProjectStatus(projectId, next);
        setCurrent(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn’t update status");
      }
    });
  }

  const isLive = current === "live";

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        title="Click to toggle Live / Staging"
        className={
          isLive
            ? "rounded border border-[rgba(77,163,255,0.25)] bg-[rgba(69,49,224,0.14)] px-1.5 py-0.5 font-mono-code text-[10px] text-[#4da3ff] disabled:opacity-60"
            : "rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-mono-code text-[10px] text-[#b8bfd8] disabled:opacity-60"
        }
      >
        {LABEL[current] ?? current}
      </button>
      {error && <span className="text-[10px] text-[#ea6d76]">{error}</span>}
    </span>
  );
}
