import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Boxes,
  Diff,
  History,
  ListChecks,
  Network,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

export type CollectionTab =
  | "fields"
  | "preview"
  | "validation"
  | "versions"
  | "comparison"
  | "dependencies"
  | "documentation"
  | "blueprints";

const TABS: Array<{ id: CollectionTab; label: string; icon: LucideIcon }> = [
  { id: "fields", label: "Field Manager", icon: SlidersHorizontal },
  { id: "preview", label: "Visual Preview", icon: Sparkles },
  { id: "validation", label: "Validation", icon: ListChecks },
  { id: "versions", label: "Versions", icon: History },
  { id: "comparison", label: "Comparison", icon: Diff },
  { id: "dependencies", label: "Dependencies", icon: Network },
  { id: "documentation", label: "Documentation", icon: BookOpen },
  { id: "blueprints", label: "Blueprints", icon: Boxes },
];

// A plain anchor-link tab strip — no client JS needed, since the active tab
// is just a `?tab=` search param page.tsx already reads server-side. Six
// tabs from the reference design (Analytics, Performance, Migration, AI
// Insights, Auto-Optimize, Health) are deliberately absent: nothing in this
// stack could back them with real data, and the request was explicit about
// skipping those rather than faking them (see docs/PHASE-6-NOTES.md).
export default function CollectionTabs({
  projectId,
  collectionId,
  active,
}: {
  projectId: string;
  collectionId: string;
  active: CollectionTab;
}) {
  return (
    <div className="surface-standard flex flex-wrap gap-1 rounded-2xl p-1.5">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        return (
          <a
            key={tab.id}
            href={`/projects/${projectId}/collections/${collectionId}?tab=${tab.id}`}
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

export { TABS as COLLECTION_TABS };
export const DEFAULT_TAB: CollectionTab = "fields";
