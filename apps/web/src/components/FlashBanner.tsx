"use client";

import { useEffect, useState } from "react";
import InlineAlert, { type InlineAlertTone } from "./InlineAlert";

// A page-level confirmation banner, for the cases where the thing that just
// saved can't reliably keep its own local "saved" state around long enough
// to show it -- e.g. EditProjectModal on the Projects page: a successful
// edit bumps the project's updated_at, which can promote it into (or out
// of) the "most recently updated" featured slot on revalidation, remounting
// that project's card (and the modal inside it) into a different position
// in the tree. A banner anchored here, at a fixed spot in the page, isn't
// affected by any of that reshuffling below it.
//
// emitFlash() fires a plain DOM CustomEvent rather than going through
// React context, so a caller several component boundaries away (a modal
// nested in one particular project card) can reach this without every
// intermediate server component needing to thread a callback prop through.
const EVENT_NAME = "app:flash";

export function emitFlash(tone: InlineAlertTone, message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { tone, message } }));
}

export default function FlashBanner() {
  const [flash, setFlash] = useState<{ tone: InlineAlertTone; message: string } | null>(null);

  useEffect(() => {
    function onFlash(e: Event) {
      const detail = (e as CustomEvent<{ tone: InlineAlertTone; message: string }>).detail;
      if (detail?.message) setFlash(detail);
    }
    window.addEventListener(EVENT_NAME, onFlash);
    return () => window.removeEventListener(EVENT_NAME, onFlash);
  }, []);

  if (!flash) return null;

  return (
    <div className="mt-6">
      <InlineAlert
        tone={flash.tone}
        message={flash.message}
        onDismiss={() => setFlash(null)}
        autoDismissMs={flash.tone === "success" ? 4000 : undefined}
      />
    </div>
  );
}
