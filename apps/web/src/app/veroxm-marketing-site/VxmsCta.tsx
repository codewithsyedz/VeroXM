import { ArrowRight } from "lucide-react";
import type { MarketingPageContent } from "@/lib/veroxm-marketing-site";

export function VxmsCta({ content }: { content: MarketingPageContent }) {
  return (
    <section className="vxms-section">
      <div className="container">
        <div className="vxms-cta">
          <div className="vxms-cta-shape vxms-cta-shape-one" aria-hidden="true" />
          <div className="vxms-cta-shape vxms-cta-shape-two" aria-hidden="true" />
          <h2 className="vxms-heading">{content.ctaHeading}</h2>
          <p className="vxms-subheading">{content.ctaDescription}</p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <a href={content.ctaPrimaryHref} className="button-primary motion-interactive px-5 text-[13.5px]">
              {content.ctaPrimaryLabel} <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={content.ctaSecondaryHref}
              className="motion-interactive inline-flex min-h-[44px] items-center justify-center rounded-[0.625rem] border border-white/15 px-5 text-[13.5px] font-semibold text-white/90 transition-colors hover:bg-white/10"
            >
              {content.ctaSecondaryLabel}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
