"use client";

import { usePathname } from "next/navigation";
import { ArrowRight, FileText, Layers, SlidersHorizontal, Terminal, Users } from "lucide-react";

// The four-card section band, rendered inside a project's own pages
// (via this segment's layout.tsx) rather than fused into the sticky
// TopNav — moved back out per a later request, so it scrolls with the
// page instead of living permanently in the header. Only three of the
// four cards are ever "active" here (Content model, Content, Access);
// the fourth (Projects) is a real link back out to the project list, not
// a status this band tracks, since you're always inside a project while
// it's showing.
//
// Media doesn't get a card (it didn't in the reference either) — it's
// reached from each project's card on the Projects list page instead.

interface Section {
  key: string;
  label: string;
  hint: string;
  href: (projectId: string) => string;
  icon: typeof Layers;
}

const SECTIONS: Section[] = [
  { key: "projects", label: "Projects", hint: "Active digital workspaces", href: () => "/projects", icon: Layers },
  {
    key: "collections",
    label: "Content model",
    hint: "Structure the system",
    href: (id) => `/projects/${id}/collections`,
    icon: SlidersHorizontal,
  },
  {
    key: "content",
    label: "Content",
    hint: "Review and publish",
    href: (id) => `/projects/${id}/content`,
    icon: FileText,
  },
  {
    key: "access",
    label: "Developer",
    hint: "Keys, analytics, explorer & docs",
    href: (id) => `/projects/${id}/access`,
    icon: Terminal,
  },
  {
    key: "members",
    label: "Members",
    hint: "Roles & team access",
    href: (id) => `/projects/${id}/members`,
    icon: Users,
  },
];

function activeKey(rest: string): string {
  if (rest.includes("/content")) return "content";
  if (rest.startsWith("/collections")) return "collections";
  if (rest.startsWith("/access")) return "access";
  if (rest.startsWith("/members")) return "members";
  return "";
}

export default function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname() ?? "";
  const rest = pathname.startsWith(`/projects/${projectId}`)
    ? pathname.slice(`/projects/${projectId}`.length)
    : "";
  const active = activeKey(rest);

  return (
    <nav aria-label="Project sections" className="border-b border-white/[0.07] bg-black/20">
      <div className="container">
        <ul className="-mx-[var(--db-gutter-mobile)] flex overflow-x-auto md:mx-0 md:grid md:grid-cols-5">
          {SECTIONS.map((section) => {
            const isActive = active === section.key;
            const Icon = section.icon;

            return (
              <li key={section.key} className="min-w-[210px] flex-1 md:min-w-0">
                <a
                  href={section.href(projectId)}
                  aria-current={isActive ? "page" : undefined}
                  className={`motion-interactive group flex h-full items-center gap-3 border-r border-white/[0.05] px-5 py-4 ${
                    isActive
                      ? "bg-white/[0.045] shadow-[inset_0_1px_0_rgba(77,163,255,0.35)]"
                      : "hover:bg-white/[0.025]"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border ${
                      isActive
                        ? "border-[rgba(77,163,255,0.35)] bg-[rgba(69,49,224,0.18)] text-[#4da3ff]"
                        : "border-white/[0.08] bg-white/[0.03] text-[#7680a3]"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-[14px] font-medium ${
                        isActive ? "text-[#f2f3fb]" : "text-[#b8bfd8]"
                      }`}
                    >
                      {section.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-[#7680a3]">
                      {section.hint}
                    </span>
                  </span>

                  <ArrowRight
                    className={`h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 ${
                      isActive ? "text-[#4da3ff]" : "text-[#454b6e]"
                    }`}
                    aria-hidden="true"
                  />
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
