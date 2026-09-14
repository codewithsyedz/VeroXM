import { mediaUrl } from "@/lib/veroxm-media";
import { MARKETING_SITE_PROJECT_ID, type ScaleStat } from "@/lib/veroxm-marketing-site";
import type { RawMediaRef } from "@/lib/veroxm-media";

export function VxmsScale({
  heading,
  description,
  image,
  stats,
}: {
  heading: string;
  description: string;
  image: RawMediaRef | null;
  stats: ScaleStat[];
}) {
  const url = mediaUrl(MARKETING_SITE_PROJECT_ID, image);
  return (
    <section className="vxms-section vxms-section-alt">
      <div className="container grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
        <div className="vxms-image-frame aspect-[4/3]">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[13px] text-white/40">Product visual</div>
          )}
        </div>
        <div>
          <span className="eyebrow vxms-badge">Results</span>
          <h2 className="vxms-heading">{heading}</h2>
          <p className="vxms-subheading">{description}</p>
          <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="vxms-stat-value">{s.value}</div>
                <div className="vxms-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
