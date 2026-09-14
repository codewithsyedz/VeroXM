import type { ThemeImpactContent } from "@/lib/veroxm-marketing";

export function ImpactFooter({ content }: { content: ThemeImpactContent }) {
  return (
    <footer className="imp-footer">
      <div className="container py-14">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <span className="flex items-center gap-2 text-[15px] font-semibold text-[var(--db-ink)]">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--db-sapphire)] text-[11px] font-bold text-white">V</span>
              {content.footerBrandText}
            </span>
          </div>
          {content.footerColumns.map((col) => (
            <div key={col.heading}>
              <h4 className="imp-footer-heading">{col.heading}</h4>
              <ul className="mt-3 flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} className="imp-footer-link">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-[var(--db-hairline-quiet)] pt-6 text-[13px] text-[var(--db-ink-muted)]">
          {content.footerCopyright}
        </div>
      </div>
    </footer>
  );
}
