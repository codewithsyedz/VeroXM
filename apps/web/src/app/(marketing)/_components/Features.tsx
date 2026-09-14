import type { VeroXMMainPage } from "@/lib/veroxm-marketing";
import { mediaUrl } from "@/lib/veroxm-media";

export function Features({ features, projectId }: { features: VeroXMMainPage["features"]; projectId: string }) {
  return (
    <section id="features" className="mkt-section">
      <div className="container">
        <span className="eyebrow mkt-badge">{features.badge}</span>
        <h2 className="mkt-heading">
          {features.heading1} <span className="text-[var(--db-sapphire-soft)]">{features.heading2}</span>
        </h2>
        <p className="mkt-subheading">{features.subheading}</p>

        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {features.cards.map((card) => {
            const icon = mediaUrl(projectId, card.icon);
            return (
              <div key={card.id} className="surface-standard mkt-card flex flex-col items-start gap-4">
                {icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={icon} alt="" width={28} height={28} className="h-7 w-7 object-contain" loading="lazy" />
                ) : (
                  <span className="mkt-icon-chip" />
                )}
                <span className="text-[13px] font-semibold leading-snug text-[var(--db-ink)]">{card.title}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
