import { mediaUrl } from "@/lib/veroxm-media";
import { MARKETING_PROJECT_ID, type ClientLogo } from "@/lib/veroxm-marketing";

export function ImpactLogos({ logos }: { logos: ClientLogo[] }) {
  if (!logos.length) return null;
  return (
    <section className="imp-section imp-section-alt !py-10">
      <div className="container imp-logo-strip">
        {logos.map((logo) => {
          const url = mediaUrl(MARKETING_PROJECT_ID, logo.logo);
          return url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={logo.id} src={url} alt={logo.name} className="h-7 w-auto object-contain grayscale" />
          ) : (
            <span key={logo.id} className="imp-logo-chip">
              {logo.name}
            </span>
          );
        })}
      </div>
    </section>
  );
}
