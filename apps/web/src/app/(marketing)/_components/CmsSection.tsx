import type { VeroXMMainPage } from "@/lib/veroxm-marketing";
import { mediaUrl } from "@/lib/veroxm-media";

export function CmsSection({ cms, projectId }: { cms: VeroXMMainPage["cms"]; projectId: string }) {
  return (
    <section id="cms" className="mkt-section">
      <div className="container">
        <span className="eyebrow mkt-badge">{cms.badge}</span>
        <h2 className="mkt-heading">{cms.heading}</h2>
        <p className="mkt-subheading">{cms.subheading}</p>

        <div className="mt-14 flex flex-col gap-20">
          {cms.features.map((feature, index) => {
            const image = mediaUrl(projectId, feature.image);
            const icon = mediaUrl(projectId, feature.icon);
            const reverse = index % 2 === 1;
            return (
              <div
                key={feature.id}
                className={`grid grid-cols-1 items-center gap-10 lg:grid-cols-2 ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}
              >
                <div>
                  {icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={icon} alt="" width={40} height={40} className="mkt-icon-chip h-10 w-10 p-2" loading="lazy" />
                  ) : null}
                  <h3 className="mt-5 text-2xl font-semibold tracking-tight text-[var(--db-ink)]">{feature.title}</h3>
                  <p className="mt-3 max-w-md text-[15px] leading-relaxed text-[var(--db-ink-muted)]">{feature.description}</p>
                </div>
                {image ? (
                  <div className="surface-feature overflow-hidden rounded-2xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image} alt="" className="w-full object-cover" loading="lazy" />
                  </div>
                ) : (
                  <div className="surface-feature aspect-video rounded-2xl" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
