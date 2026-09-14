import type { ThemeImpactContent } from "@/lib/veroxm-marketing";
import { ImpactHero } from "./ImpactHero";
import { ImpactLogos } from "./ImpactLogos";
import { ImpactFeatures } from "./ImpactFeatures";
import { ImpactStats } from "./ImpactStats";
import { ImpactCaseStudy } from "./ImpactCaseStudy";
import { ImpactCta } from "./ImpactCta";
import { DemoRequestForm } from "../_components/DemoRequestForm";

export function ImpactPage({ content }: { content: ThemeImpactContent }) {
  return (
    <>
      <ImpactHero content={content} />
      <ImpactLogos logos={content.logos} />
      <ImpactFeatures cards={content.featureCards} />
      <ImpactStats image={content.statsImage} stats={content.stats} />
      <ImpactCaseStudy caseStudies={content.caseStudies} />

      <section id="book-a-demo" className="imp-section imp-section-alt">
        <div className="container grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
          <div>
            <span className="eyebrow imp-badge">{content.heroCtaLabel}</span>
            <h2 className="imp-heading">See VeroXM run on your own content.</h2>
            <p className="imp-subheading">
              Tell us a bit about your team and we&apos;ll walk you through a live workspace -- content modeling,
              publishing, and the SDKs -- tailored to what you&apos;re building.
            </p>
          </div>
          <DemoRequestForm heading="Request a demo" subheading="Takes about a minute. We'll follow up by email." />
        </div>
      </section>

      <ImpactCta content={content} />
    </>
  );
}
