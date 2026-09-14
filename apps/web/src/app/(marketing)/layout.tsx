import "./marketing.css";
import "./impact/theme-impact.css";
import "./experience/theme-experience.css";
import type { Metadata } from "next";
import {
  getMainPageContent,
  getActiveTheme,
  getThemeImpactContent,
  getThemeExperienceContent,
  MARKETING_PROJECT_ID,
} from "@/lib/veroxm-marketing";
import { mediaUrl } from "@/lib/veroxm-media";
import { Nav } from "./_components/Nav";
import { Footer } from "./_components/Footer";
import { ImpactNav } from "./impact/ImpactNav";
import { ImpactFooter } from "./impact/ImpactFooter";
import { ExperienceNav } from "./experience/ExperienceNav";
import { ExperienceFooter } from "./experience/ExperienceFooter";

// Marketing route group: veroXM Landing's own real marketing site,
// dogfooding VeroXM (project 12) -- content comes from @veroxm/sdk exactly
// as any third-party app would consume it, just server-side here (see
// src/lib/veroxm-marketing.ts). Three selectable themes, switched from the
// dashboard via the "site-settings" singleton's Active Theme field (see
// getActiveTheme()): "obsidian" (the original, matches the live dashboard's
// `.dashboard-theme`), "impact" and "experience" (close rebuilds of two
// reference marketing-site screenshots, each with its own CMS schema --
// see (marketing)/impact and (marketing)/experience).
export async function generateMetadata(): Promise<Metadata> {
  try {
    const page = await getMainPageContent();
    return {
      title: page.meta.title,
      description: page.meta.description,
      icons: page.meta.favicon ? [mediaUrl(MARKETING_PROJECT_ID, page.meta.favicon) ?? ""] : undefined,
      openGraph: {
        title: page.meta.ogtitle,
        description: page.meta.ogdescription,
        images: page.meta.ogimage ? [mediaUrl(MARKETING_PROJECT_ID, page.meta.ogimage) ?? ""] : undefined,
      },
      twitter: {
        card: (page.meta.twittercard as "summary_large_image") ?? "summary_large_image",
        title: page.meta.twittertitle,
        description: page.meta.twitterdescription,
      },
    };
  } catch {
    return { title: "VeroXM", description: "The Experience Operating System." };
  }
}

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const theme = await getActiveTheme();

  if (theme === "impact") {
    const content = await getThemeImpactContent();
    return (
      <div id="top" className="theme-impact flex min-h-full flex-col">
        <ImpactNav navLinks={content.navLinks} ctaLabel={content.heroCtaLabel} ctaHref={content.heroCtaHref} />
        <main className="flex-1">{children}</main>
        <ImpactFooter content={content} />
      </div>
    );
  }

  if (theme === "experience") {
    const content = await getThemeExperienceContent();
    return (
      <div id="top" className="theme-experience flex min-h-full flex-col">
        <ExperienceNav navLinks={content.navLinks} ctaLabel={content.heroCtaLabel} ctaHref={content.heroCtaHref} />
        <main className="flex-1">{children}</main>
        <ExperienceFooter content={content} />
      </div>
    );
  }

  const page = await getMainPageContent();
  const headerIcon = mediaUrl(MARKETING_PROJECT_ID, page.common.alt.headericon);

  return (
    <div id="top" className="dashboard-theme flex min-h-full flex-col">
      <Nav companyName={page.common.companyname} logoUrl={headerIcon} bookDemoLabel={page.common.buttons.bookdemo} />
      <main className="flex-1">{children}</main>
      <Footer footer={page.footer} companyName={page.common.companyname} />
    </div>
  );
}
