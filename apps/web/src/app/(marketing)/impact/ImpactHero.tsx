import { ArrowRight, LayoutGrid } from "lucide-react";
import { mediaUrl } from "@/lib/veroxm-media";
import { MARKETING_PROJECT_ID, type ThemeImpactContent } from "@/lib/veroxm-marketing";

export function ImpactHero({ content }: { content: ThemeImpactContent }) {
  const heroImage = mediaUrl(MARKETING_PROJECT_ID, content.heroImage);
  const publishIcon = mediaUrl(MARKETING_PROJECT_ID, content.publishIcon);

  return (
    <section className="imp-hero">
      <div className="container grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
        <div>
          <h1 className="imp-hero-heading">{content.heroHeading}</h1>
          <p className="imp-subheading">{content.heroSubheading}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href={content.heroCtaHref} className="button-primary motion-interactive px-5 text-[13.5px]">
              {content.heroCtaLabel} <ArrowRight className="h-4 w-4" />
            </a>
            <a href={content.heroSecondaryHref} className="button-secondary motion-interactive px-5 text-[13.5px]">
              {content.heroSecondaryLabel}
            </a>
          </div>
        </div>
        <div className="relative pb-8 pl-4 pt-2">
          <div className="imp-mockup aspect-[4/3]">
            {heroImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={heroImage} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[13px] text-white/40">
                Dashboard preview
              </div>
            )}
          </div>
          <div className="imp-publish-card">
            {publishIcon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={publishIcon} alt="" className="h-9 w-9 rounded-lg object-cover" />
            ) : (
              <span className="imp-feature-icon">
                <LayoutGrid className="h-5 w-5" aria-hidden="true" />
              </span>
            )}
            <span className="text-[13px] font-semibold text-[var(--db-ink)]">{content.publishLabel}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
