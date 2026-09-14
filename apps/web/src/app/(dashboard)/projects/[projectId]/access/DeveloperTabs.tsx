import type { LucideIcon } from "lucide-react";
import { BookOpen, FlaskConical, Fingerprint, KeyRound, LineChart } from "lucide-react";

export type DeveloperTab = "keys" | "auth" | "analytics" | "explorer" | "docs";

const TABS: Array<{ id: DeveloperTab; label: string; icon: LucideIcon }> = [
  { id: "keys", label: "API Keys", icon: KeyRound },
  { id: "auth", label: "Authentication", icon: Fingerprint },
  { id: "analytics", label: "API Analytics", icon: LineChart },
  { id: "explorer", label: "API Explorer", icon: FlaskConical },
  { id: "docs", label: "SDK Docs", icon: BookOpen },
];

// Same plain anchor-link tab strip as CollectionTabs — the active tab is a
// `?tab=` search param page.tsx reads server-side, no client JS needed.
// This screen used to be a single page (API Keys only); it's now the home
// for the whole Developer module from the reference design, since project
// tokens ARE the API keys — see docs/PHASE-7-NOTES.md for why this reuses
// the existing Access page rather than adding a fifth ProjectNav card.
export default function DeveloperTabs({
  projectId,
  active,
}: {
  projectId: string;
  active: DeveloperTab;
}) {
  return (
    <div className="surface-standard flex flex-wrap gap-1 rounded-2xl p-1.5">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        return (
          <a
            key={tab.id}
            href={`/projects/${projectId}/access?tab=${tab.id}`}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
              isActive
                ? "bg-white/[0.08] text-[#f2f3fb]"
                : "text-[#7680a3] hover:bg-white/[0.03] hover:text-[#b8bfd8]"
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {tab.label}
          </a>
        );
      })}
    </div>
  );
}

export { TABS as DEVELOPER_TABS };
export const DEFAULT_TAB: DeveloperTab = "keys";
