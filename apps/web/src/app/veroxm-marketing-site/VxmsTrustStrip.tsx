import { mediaUrl } from "@/lib/veroxm-media";
import { MARKETING_SITE_PROJECT_ID, type TrustLogo } from "@/lib/veroxm-marketing-site";

export function VxmsTrustStrip({ heading, logos }: { heading: string; logos: TrustLogo[] }) {
  if (!logos.length) return null;
  return (
    <section className="vxms-section vxms-section-alt !py-10">
      <div className="container">
        {heading ? (
          <p className="mb-6 text-center text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--db-ink-quiet)]">
            {heading}
          </p>
        ) : null}
        <div className="vxms-logo-strip">
          {logos.map((logo) => {
            const url = mediaUrl(MARKETING_SITE_PROJECT_ID, logo.logo);
            return url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={logo.id} src={url} alt={logo.name} className="h-7 w-auto object-contain grayscale" />
            ) : (
              <span key={logo.id} className="vxms-logo-chip">
                {logo.name}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
