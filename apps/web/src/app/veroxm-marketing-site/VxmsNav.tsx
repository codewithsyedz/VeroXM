import { ArrowRight } from "lucide-react";
import type { NavLink } from "@/lib/veroxm-marketing-site";

export function VxmsNav({
  logoText,
  navLinks,
  ctaLabel,
  ctaHref,
}: {
  logoText: string;
  navLinks: NavLink[];
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <header className="vxms-nav">
      <div className="container flex h-16 items-center justify-between gap-6">
        <a href="#top" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-[var(--db-ink)]">
          <span className="vxms-logo-mark">V</span>
          {logoText}
        </a>
        <nav className="hidden items-center gap-7 lg:flex">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} className="vxms-nav-link">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <a href={ctaHref} className="button-primary motion-interactive whitespace-nowrap px-4 text-[12.5px]">
            {ctaLabel} <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </header>
  );
}
