import type { ThemeExperienceContent } from "@/lib/veroxm-marketing";
import { ExperienceHero } from "./ExperienceHero";
import { ExperienceCapabilities } from "./ExperienceCapabilities";
import { ExperienceIndustries } from "./ExperienceIndustries";
import { ExperienceCta } from "./ExperienceCta";
import { DemoRequestForm } from "../_components/DemoRequestForm";

export function ExperiencePage({ content }: { content: ThemeExperienceContent }) {
  return (
    <>
      <ExperienceHero content={content} />
      <ExperienceCapabilities capabilities={content.capabilities} stats={content.stats} />
      <ExperienceIndustries industries={content.industries} />

      <section id="book-a-demo" className="exp-section exp-section-alt">
        <div className="container grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
          <div>
            <span className="eyebrow">{content.heroCtaLabel}</span>
            <h2 className="exp-heading">See VeroXM run on your own content.</h2>
            <p className="exp-subheading">
              Tell us a bit about your team and we&apos;ll walk you through a live workspace -- content modeling,
              publishing, and the SDKs -- tailored to what you&apos;re building.
            </p>
          </div>
          <DemoRequestForm heading="Request a demo" subheading="Takes about a minute. We'll follow up by email." />
        </div>
      </section>

      <ExperienceCta content={content} />
    </>
  );
}
