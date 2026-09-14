"use client";

import { useEffect } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

export type InlineAlertTone = "success" | "error";

// Shared inline banner for save/update/create/delete confirmations across
// the dashboard (content entries, project settings, etc.) -- renders in
// the form's own flow rather than as a floating toast. Dismissible by hand
// at any time; pass autoDismissMs to also have it clear itself after a
// delay (callers use this for success confirmations, which don't need to
// stick around once read -- errors are left to persist until the user
// dismisses them or fixes the problem and retries).
export default function InlineAlert({
  tone,
  message,
  onDismiss,
  autoDismissMs,
}: {
  tone: InlineAlertTone;
  message: string;
  onDismiss?: () => void;
  autoDismissMs?: number;
}) {
  const isSuccess = tone === "success";

  useEffect(() => {
    if (!autoDismissMs || !onDismiss) return;
    const timer = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(timer);
    // Re-arm the timer whenever the message changes (a fresh save should
    // get its own full countdown) -- intentionally not depending on
    // onDismiss itself, which callers typically pass as a fresh closure
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, autoDismissMs]);

  return (
    <div
      role={isSuccess ? "status" : "alert"}
      className={
        isSuccess
          ? "flex items-start gap-2.5 rounded-lg border border-[rgba(52,211,153,0.35)] bg-[rgba(52,211,153,0.1)] px-3.5 py-3 text-sm text-[#34d399]"
          : "flex items-start gap-2.5 rounded-lg border border-[rgba(234,109,118,0.35)] bg-[rgba(234,109,118,0.1)] px-3.5 py-3 text-sm text-[#ea6d76]"
      }
    >
      {isSuccess ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <p className="flex-1 whitespace-pre-wrap leading-5">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-m-1 shrink-0 rounded p-1 opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
