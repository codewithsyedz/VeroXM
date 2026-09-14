import { ArrowRight, Sparkles, Share2 } from "lucide-react";
import type { MarketingPageContent } from "@/lib/veroxm-marketing-site";

export function VxmsHero({ content }: { content: MarketingPageContent }) {
  return (
    <section className="vxms-hero">
      <div className="container grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
        <div>
          <span className="eyebrow vxms-badge">{content.heroEyebrow}</span>
          <h1 className="vxms-hero-heading mt-3">
            {content.heroHeading} <span className="vxms-hero-highlight">{content.heroHeadingHighlight}</span>
          </h1>
          <p className="vxms-subheading">{content.heroSubheading}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href={content.heroPrimaryCtaHref} className="button-primary motion-interactive px-5 text-[13.5px]">
              {content.heroPrimaryCtaLabel} <ArrowRight className="h-4 w-4" />
            </a>
            <a href={content.heroSecondaryCtaHref} className="button-secondary motion-interactive px-5 text-[13.5px]">
              {content.heroSecondaryCtaLabel}
            </a>
          </div>
        </div>

        <div className="relative pb-8 pl-4 pr-2 pt-2">
          <div className="vxms-mockup">
            <div className="vxms-mockup-sidebar">
              <div className="vxms-mockup-sidebar-dot is-active" />
              <div className="vxms-mockup-sidebar-dot" />
              <div className="vxms-mockup-sidebar-dot" />
              <div className="vxms-mockup-sidebar-dot" />
            </div>
            <div className="vxms-mockup-body">
              <div className="vxms-mockup-title">{content.heroDashboardTitle}</div>
              <div className="vxms-mockup-stats">
                {content.heroDashboardStats.map((s) => (
                  <div key={s.label} className="vxms-mockup-stat">
                    <div className="vxms-mockup-stat-value">{s.value}</div>
                    <div className="vxms-mockup-stat-label">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="vxms-mockup-activity">
                <div className="vxms-mockup-activity-label">Recent activity</div>
                {content.heroDashboardRecentActivity.map((a) => (
                  <div key={a.title} className="vxms-mockup-activity-item">
                    <span className="vxms-mockup-activity-title">{a.title}</span>
                    <span className="vxms-mockup-activity-time">{a.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="vxms-floating-card vxms-floating-card-one">
            <span className="vxms-floating-icon">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            {content.heroFloatingCardOneText}
          </div>
          <div className="vxms-floating-card vxms-floating-card-two">
            <span className="vxms-floating-icon">
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </span>
            {content.heroFloatingCardTwoText}
          </div>
        </div>
      </div>
    </section>
  );
}
