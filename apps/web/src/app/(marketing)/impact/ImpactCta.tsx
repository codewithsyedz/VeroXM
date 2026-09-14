import { ArrowRight } from "lucide-react";
import type { ThemeImpactContent } from "@/lib/veroxm-marketing";

export function ImpactCta({ content }: { content: ThemeImpactContent }) {
  return (
    <section className="imp-section">
      <div className="container">
        <div className="imp-cta">
          <h2 className="imp-heading">{content.ctaHeading}</h2>
          <p className="imp-subheading">{content.ctaSubheading}</p>
          <a href={content.ctaButtonHref} className="button-primary motion-interactive mt-7 inline-flex px-5 text-[13.5px]">
            {content.ctaButtonLabel} <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
