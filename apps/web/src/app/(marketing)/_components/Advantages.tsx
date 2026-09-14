import type { VeroXMMainPage } from "@/lib/veroxm-marketing";
import { mediaUrl } from "@/lib/veroxm-media";

export function Advantages({ advantages, projectId }: { advantages: VeroXMMainPage["advantages"]; projectId: string }) {
  return (
    <section id="advantages" className="mkt-section mkt-section-alt">
      <div className="container">
        <span className="eyebrow mkt-badge">{advantages.badge}</span>
        <h2 className="mkt-heading max-w-2xl">{advantages.heading}</h2>
        <p className="mkt-subheading">{advantages.description}</p>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {advantages.teams.map((team) => {
            const icon = mediaUrl(projectId, team.icon);
            return (
              <div key={team.id} className="surface-inset mkt-card flex flex-col items-center gap-3 text-center">
                {icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={icon} alt="" width={40} height={40} className="h-10 w-10 object-contain" loading="lazy" />
                ) : null}
                <span className="text-[13px] font-semibold text-[var(--db-ink)]">{team.name}</span>
              </div>
            );
          })}
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 border-t border-[var(--db-hairline-quiet)] pt-10 sm:grid-cols-3">
          {advantages.stats.map((stat) => (
            <div key={stat.id}>
              <div className="font-mono-code text-4xl font-semibold text-[var(--db-sapphire-soft)]">{stat.value}</div>
              <div className="mt-1 text-[13px] text-[var(--db-ink-muted)]">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
