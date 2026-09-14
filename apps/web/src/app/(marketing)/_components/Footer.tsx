import type { VeroXMMainPage } from "@/lib/veroxm-marketing";
import { NewsletterForm } from "./NewsletterForm";

export function Footer({ footer, companyName }: { footer: VeroXMMainPage["footer"]; companyName: string }) {
  return (
    <footer className="border-t border-[var(--db-hairline-quiet)] py-14">
      <div className="container grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--db-ink)]">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--db-sapphire)] text-[11px] font-bold text-white">V</span>
            {companyName}
          </div>
          <div
            className="mt-4 text-[13px] leading-relaxed text-[var(--db-ink-quiet)] [&_p]:m-0"
            dangerouslySetInnerHTML={{ __html: footer.address }}
          />
        </div>

        <div>
          <div className="eyebrow">{footer.newsletter.heading}</div>
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-[var(--db-ink-muted)]">{footer.newsletter.description}</p>
          <NewsletterForm placeholder={footer.newsletter.placeholder} />
        </div>

        <div>
          <div className="eyebrow">Company</div>
          <ul className="mt-3 flex flex-col gap-2 text-[13px] text-[var(--db-ink-muted)]">
            <li><a href={`mailto:${footer.email}`} className="hover:text-[var(--db-ink)]">{footer.email}</a></li>
            <li><a href="#" className="hover:text-[var(--db-ink)]">{footer.links.privacy}</a></li>
          </ul>
        </div>

        <div>
          <div className="eyebrow">Social</div>
          <ul className="mt-3 flex flex-col gap-2 text-[13px] text-[var(--db-ink-muted)]">
            <li><a href="#" className="hover:text-[var(--db-ink)]">{footer.links.twitter}</a></li>
            <li><a href="#" className="hover:text-[var(--db-ink)]">{footer.links.instagram}</a></li>
          </ul>
        </div>
      </div>

      <div className="container mt-10 border-t border-[var(--db-hairline-quiet)] pt-6 text-[12px] text-[var(--db-ink-quiet)]">
        {footer.copyright}
      </div>
    </footer>
  );
}
