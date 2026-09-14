import { mediaUrl } from "@/lib/veroxm-media";
import { MARKETING_PROJECT_ID, type StatItem } from "@/lib/veroxm-marketing";
import type { RawMediaRef } from "@/lib/veroxm-media";

export function ImpactStats({ image, stats }: { image: RawMediaRef | null; stats: StatItem[] }) {
  const url = mediaUrl(MARKETING_PROJECT_ID, image);
  return (
    <section className="imp-section imp-section-alt">
      <div className="container grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
        <div className="imp-mockup aspect-[4/3]">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[13px] text-white/40">Product visual</div>
          )}
        </div>
        <div>
          <span className="eyebrow imp-badge">Results</span>
          <h2 className="imp-heading">Measurable impact, from day one.</h2>
          <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-7">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="imp-stat-value">{s.value}</div>
                <div className="imp-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
