import { Linkedin, Twitter, Youtube, Share2 } from "lucide-react";
import type { MarketingPageContent } from "@/lib/veroxm-marketing-site";

function socialIcon(platform: string) {
  const p = platform.toLowerCase();
  if (p.includes("linkedin")) return Linkedin;
  if (p === "x" || p.includes("twitter")) return Twitter;
  if (p.includes("youtube")) return Youtube;
  return Share2;
}

export function VxmsFooter({ content }: { content: MarketingPageContent }) {
  return (
    <footer className="vxms-footer">
      <div className="container py-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_repeat(4,minmax(0,1fr))]">
          <div>
            <span className="flex items-center gap-2 text-[15px] font-semibold text-[var(--db-ink)]">
              <span className="vxms-logo-mark">V</span>
              {content.navLogoText}
            </span>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-[var(--db-ink-muted)]">{content.footerTagline}</p>
            <div className="mt-4 flex items-center gap-2">
              {content.footerSocials.map((s) => {
                const Icon = socialIcon(s.platform);
                return (
                  <a key={s.platform} href={s.href} className="vxms-social-icon" aria-label={s.platform}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </a>
                );
              })}
            </div>
          </div>

          {content.footerColumns.map((col) => (
            <div key={col.heading}>
              <h4 className="vxms-footer-heading">{col.heading}</h4>
              <ul className="mt-3 flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} className="vxms-footer-link">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="surface-standard mt-12 flex flex-col gap-4 rounded-2xl p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="vxms-footer-heading">{content.footerNewsletterHeading}</h4>
            <p className="mt-1 text-[13px] text-[var(--db-ink-muted)]">{content.footerNewsletterDescription}</p>
          </div>
          <form action="#" className="flex w-full max-w-sm items-center gap-2 sm:w-auto">
            <input
              type="email"
              placeholder={content.footerNewsletterPlaceholder}
              className="vxms-newsletter-input"
              aria-label={content.footerNewsletterPlaceholder}
            />
            <button type="submit" className="button-primary motion-interactive whitespace-nowrap px-4 text-[12.5px]">
              Subscribe
            </button>
          </form>
        </div>

        <div className="mt-10 border-t border-[var(--db-hairline-quiet)] pt-6 text-[13px] text-[var(--db-ink-muted)]">
          {content.footerCopyright}
        </div>
      </div>
    </footer>
  );
}
