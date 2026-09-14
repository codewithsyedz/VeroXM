import type { VeroXMMainPage } from "@/lib/veroxm-marketing";
import { mediaUrl } from "@/lib/veroxm-media";
import { ArrowRight } from "lucide-react";

export function TrustedSectors({ trustedsectors, projectId }: { trustedsectors: VeroXMMainPage["trustedsectors"]; projectId: string }) {
  return (
    <section className="mkt-section mkt-section-alt">
      <div className="container grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <span className="eyebrow mkt-badge">{trustedsectors.badge}</span>
          <h2 className="mkt-heading">{trustedsectors.heading}</h2>
          <p className="mkt-subheading">{trustedsectors.subheading}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            {trustedsectors.sectors.map((sector) => {
              const icon = mediaUrl(projectId, sector.icon);
              return (
                <div key={sector.id} className="surface-standard flex items-center gap-2.5 rounded-full py-2 pl-2.5 pr-4">
                  {icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={icon} alt="" width={24} height={24} className="h-6 w-6 rounded-full object-contain" loading="lazy" />
                  ) : null}
                  <span className="text-[13px] font-medium text-[var(--db-ink)]">{sector.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="surface-feature rounded-2xl p-8">
          <p className="text-[15px] leading-relaxed text-[var(--db-ink-muted)]">{trustedsectors.card.description}</p>
          <div className="mt-6 inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--db-sapphire-soft)]">
            {trustedsectors.card.button} <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </section>
  );
}
