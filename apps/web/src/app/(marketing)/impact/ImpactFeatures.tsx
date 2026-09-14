import { DynamicIcon } from "../_components/DynamicIcon";
import type { FeatureCardItem } from "@/lib/veroxm-marketing";

export function ImpactFeatures({ cards }: { cards: FeatureCardItem[] }) {
  return (
    <section className="imp-section" id="impact-features">
      <div className="container">
        <span className="eyebrow imp-badge">Platform</span>
        <h2 className="imp-heading">Everything your team needs to ship experiences.</h2>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <div key={card.title} className="surface-standard imp-feature-card">
              <span className="imp-feature-icon">
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
