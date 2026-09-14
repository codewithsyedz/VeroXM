import { DynamicIcon } from "./DynamicIcon";
import type { FeatureCardItem } from "@/lib/veroxm-marketing-site";

export function VxmsFeatures({
  heading,
  subheading,
  cards,
}: {
  heading: string;
  subheading: string;
  cards: FeatureCardItem[];
}) {
  return (
    <section className="vxms-section" id="features">
      <div className="container">
        <span className="eyebrow vxms-badge">Platform</span>
        <h2 className="vxms-heading">{heading}</h2>
        <p className="vxms-subheading">{subheading}</p>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <div key={card.title} className="surface-standard vxms-feature-card">
              <span className="vxms-feature-icon">
                <DynamicIcon name={card.icon} className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold text-[var(--db-ink)]">{card.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--db-ink-muted)]">{card.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
