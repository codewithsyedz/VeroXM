import {
  getMainPageContent,
  getActiveTheme,
  getThemeImpactContent,
  getThemeExperienceContent,
  MARKETING_PROJECT_ID,
} from "@/lib/veroxm-marketing";
import { Hero } from "./_components/Hero";
import { Features } from "./_components/Features";
import { Advantages } from "./_components/Advantages";
import { CmsSection } from "./_components/CmsSection";
import { TrustedSectors } from "./_components/TrustedSectors";
import { CtaSection } from "./_components/CtaSection";
import { Faqs } from "./_components/Faqs";
import { DemoRequestForm } from "./_components/DemoRequestForm";
import { ImpactPage } from "./impact/ImpactPage";
import { ExperiencePage } from "./experience/ExperiencePage";

export default async function MarketingHome() {
  const theme = await getActiveTheme();

  if (theme === "impact") {
    const content = await getThemeImpactContent();
    return <ImpactPage content={content} />;
  }

  if (theme === "experience") {
    const content = await getThemeExperienceContent();
    return <ExperiencePage content={content} />;
  }

  const page = await getMainPageContent();

  return (
    <>
      <Hero
        tagline={page.hero.tagline}
        heading1={page.hero.heading1}
        heading2={page.hero.heading2}
        subheading={page.hero.subheading}
        exploreLabel={page.common.buttons.explore}
        bookDemoLabel={page.common.buttons.bookdemo}
      />

      <Features features={page.features} projectId={MARKETING_PROJECT_ID} />
      <Advantages advantages={page.advantages} projectId={MARKETING_PROJECT_ID} />
      <CmsSection cms={page.cms} projectId={MARKETING_PROJECT_ID} />
      <TrustedSectors trustedsectors={page.trustedsectors} projectId={MARKETING_PROJECT_ID} />

      <section id="book-a-demo" className="mkt-section mkt-section-alt">
        <div className="container grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
          <div>
            <span className="eyebrow mkt-badge">{page.common.buttons.bookdemo}</span>
            <h2 className="mkt-heading">See VeroXM run on your own content.</h2>
            <p className="mkt-subheading">
              Tell us a bit about your team and we&apos;ll walk you through a live workspace -- content modeling,
              publishing, and the SDKs -- tailored to what you&apos;re building.
            </p>
          </div>
          <DemoRequestForm heading="Request a demo" subheading="Takes about a minute. We'll follow up by email." />
        </div>
      </section>

      <CtaSection cta={page.cta} bookDemoLabel={page.common.buttons.bookdemo} />
      <Faqs faqs={page.faqs} />
    </>
  );
}
