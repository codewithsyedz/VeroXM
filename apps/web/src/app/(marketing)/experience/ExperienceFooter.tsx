import { DynamicIcon } from "../_components/DynamicIcon";
import type { ThemeExperienceContent } from "@/lib/veroxm-marketing";

export function ExperienceFooter({ content }: { content: ThemeExperienceContent }) {
  return (
    <footer className="exp-footer">
      <div className="container py-14">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <span className="flex items-center gap-2 text-[15px] font-semibold text-[var(--db-ink)]">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-[#a680ff] to-[#6f4de0] text-[11px] font-bold text-white">V</span>
              VeroXM
            </span>
            <div className="mt-4 flex items-center gap-3">
              {content.footerSocials.map((s) => (
                <a key={s.href} href={s.href} className="icon-button">
                  <DynamicIcon name={s.icon} className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
          {content.footerColumns.map((col) => (
            <div key={col.heading}>
              <h4 className="exp-footer-heading">{col.heading}</h4>
              <ul className="mt-3 flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} className="exp-footer-link">
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
