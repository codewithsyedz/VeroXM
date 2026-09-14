import "./theme-veroxm-marketing-site.css";
import type { Metadata } from "next";
import { getMarketingPageContent } from "@/lib/veroxm-marketing-site";
import { VxmsNav } from "./VxmsNav";
import { VxmsFooter } from "./VxmsFooter";

// Standalone route for the new "VeroXM Marketing Site" CMS project (20) --
// modeled on a full VeroXM marketing-site mockup screenshot. Deliberately
// its own top-level segment (not nested in the (marketing) route group,
// which is project 12's own multi-theme site) so it reads its own CMS
// project via its own API key (see src/lib/veroxm-marketing-site.ts).
export const metadata: Metadata = {
  title: "VeroXM -- Composable Experience Management",
  description: "VeroXM unifies content, teams, and channels into one connected system.",
};

export default async function VeroxmMarketingSiteLayout({ children }: { children: React.ReactNode }) {
  const content = await getMarketingPageContent();
  return (
    <div id="top" className="theme-vxms flex min-h-full flex-col">
      <VxmsNav
        logoText={content.navLogoText}
        navLinks={content.navLinks}
        ctaLabel={content.navCtaLabel}
        ctaHref={content.navCtaHref}
      />
      <main className="flex-1">{children}</main>
      <VxmsFooter content={content} />
    </div>
  );
}
