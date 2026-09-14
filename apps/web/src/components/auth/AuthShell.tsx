import Image from "next/image";
import type { ComponentType, ReactNode } from "react";
import { LineChart, Rocket, ShieldCheck, Sparkles, Target } from "lucide-react";

// Shared two-column shell for /login and /register (docs/IDENTITY-PLATFORM-
// RECOMMENDATION.md §7 asked for a Keycloak-first auth UI; this is the
// visual redesign requested in chat, built on the app's existing "Obsidian
// Atelier" tokens/utility classes from globals.css — button-primary,
// button-secondary, icon-button, input-quiet, surface-feature, eyebrow,
// status-dot — so this stays visually consistent with the (dashboard)
// route group rather than inventing a parallel design system).
//
// The left hero panel is an abstract gradient, not a photo: there is no
// real hero image asset in this repo, and per chat this intentionally
// stays consistent with the app's existing token-based look rather than
// dropping in an unrelated stock photo.

type Feature = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  detail: string;
};

const FEATURES: Feature[] = [
  { icon: Sparkles, title: "Create", detail: "Build engaging content" },
  { icon: Target, title: "Target", detail: "Personalize with data" },
  { icon: Rocket, title: "Deliver", detail: "Publish everywhere" },
  { icon: LineChart, title: "Measure", detail: "Optimize with AI" },
];

// Deliberately qualitative, not quantified — no invented performance
// stats (e.g. "10x faster") that VeroXM hasn't actually measured.
const CAPABILITIES = [
  "Multi-channel publishing",
  "Real-time collaboration",
  "Role-based access",
  "Full audit trail",
];

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div
      className="dashboard-theme flex flex-col lg:flex-row"
      style={{ minHeight: "100vh" }}
    >
      <aside
        className="relative hidden flex-col justify-between overflow-hidden px-12 py-10 lg:flex lg:w-1/2"
        style={{
          background:
            "radial-gradient(circle at 20% 15%, rgba(90, 70, 255, 0.22), transparent 45%), radial-gradient(circle at 85% 80%, rgba(77, 163, 255, 0.16), transparent 50%), var(--db-background)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/brand/veroxm-mark.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8"
              priority
            />
            <div>
              <div className="text-[13px] font-semibold tracking-[0.14em] text-[#f2f3fb]">
                VEROXM
              </div>
              <div className="font-mono-code text-[10px] tracking-[0.08em] text-[#7680a3]">
                THE CONTENT OPERATING SYSTEM
              </div>
            </div>
          </div>
          <div className="surface-standard flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-mono-code uppercase tracking-[0.08em] text-[#b8bfd8]">
            <ShieldCheck className="h-3.5 w-3.5 text-[#4da3ff]" aria-hidden="true" />
            Secure workspace
          </div>
        </div>

        <div className="max-w-md">
          <span className="eyebrow mb-4 inline-flex items-center gap-2">
            <span className="status-dot" aria-hidden="true" />
            More than a CMS
          </span>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-[#f2f3fb]">
            Content operations,
            <br />
            <span className="text-[#8ea0ff]">unified.</span>
          </h1>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-[#b8bfd8]">
            Bring content, people, data, and channels into one workspace —
            built for teams who ship often and need everyone looking at the
            same thing.
          </p>
        </div>

        <div className="grid max-w-xs gap-3">
          {FEATURES.map(({ icon: Icon, title: featureTitle, detail }) => (
            <div
              key={featureTitle}
              className="surface-feature motion-interactive flex items-center gap-3 rounded-xl px-4 py-3"
            >
              <span className="icon-button border border-white/10 bg-white/[0.04] text-[#8ea0ff]">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <div className="text-[13px] font-semibold text-[#f2f3fb]">
                  {featureTitle}
                </div>
                <div className="text-[12px] text-[#7680a3]">{detail}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-white/[0.07] pt-6 text-[11px] font-mono-code uppercase tracking-[0.06em] text-[#7680a3]">
          {CAPABILITIES.map((label) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="status-dot" aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center bg-[var(--db-background)] px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Image
              src="/brand/veroxm-mark.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7"
              priority
            />
            <span className="text-[13px] font-semibold tracking-[0.14em] text-[#f2f3fb]">
              VEROXM
            </span>
          </div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#f2f3fb]">
            {title}
          </h2>
          <p className="mt-2 text-[14px] text-[#b8bfd8]">{description}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
