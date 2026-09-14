import { ArrowRight } from "lucide-react";
import type { ThemeExperienceContent } from "@/lib/veroxm-marketing";

export function ExperienceCta({ content }: { content: ThemeExperienceContent }) {
  return (
    <section className="exp-section">
      <div className="container">
        <div className="exp-cta">
          <h2 className="exp-heading">{content.ctaHeading}</h2>
          <p className="exp-subheading mx-auto">{content.ctaSubheading}</p>
          <a href={content.ctaButtonHref} className="button-primary motion-interactive mt-7 inline-flex px-5 text-[13.5px]">
            {content.ctaButtonLabel} <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
