import { ArrowRight, Quote } from "lucide-react";
import { mediaUrl } from "@/lib/veroxm-media";
import { MARKETING_PROJECT_ID, type ThemeExperienceContent } from "@/lib/veroxm-marketing";

export function ExperienceHero({ content }: { content: ThemeExperienceContent }) {
  const quote = content.quotes[0];
  const photo = quote ? mediaUrl(MARKETING_PROJECT_ID, quote.photo) : null;

  return (
    <section className="exp-hero">
      <div className="container grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
        <div>
          <span className="eyebrow">{content.eyebrow}</span>
          <h1 className="exp-hero-heading mt-4">
            {content.heroHeadingPre} <span className="exp-emphasis">{content.heroHeadingEmphasis}</span>
          </h1>
          <p className="exp-subheading">{content.heroSubheading}</p>
          <div className="mt-8">
            <a href={content.heroCtaHref} className="button-primary motion-interactive px-5 text-[13.5px]">
              {content.heroCtaLabel} <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
        {quote ? (
          <div className="surface-feature exp-quote-card">
            <div className="exp-quote-photo">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="p-6">
              <Quote className="h-5 w-5 text-[var(--db-sapphire-soft)]" aria-hidden="true" />
              <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--db-ink)]">&ldquo;{quote.quote}&rdquo;</p>
              <div className="mt-4 text-[13px] font-semibold text-[var(--db-ink)]">
                {quote.authorName}
                <span className="ml-1.5 font-normal text-[var(--db-ink-muted)]">{quote.authorRole}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
