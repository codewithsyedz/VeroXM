import { mediaUrl } from "@/lib/veroxm-media";
import { MARKETING_PROJECT_ID, type IndustryCard } from "@/lib/veroxm-marketing";

export function ExperienceIndustries({ industries }: { industries: IndustryCard[] }) {
  if (!industries.length) return null;
  return (
    <section className="exp-section" id="industries">
      <div className="container">
        <span className="eyebrow">Industries</span>
        <h2 className="exp-heading">Built for the sectors that move the world.</h2>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {industries.map((card) => {
            const url = mediaUrl(MARKETING_PROJECT_ID, card.image);
            return (
              <a key={card.id} href={card.href || "#"} className="exp-industry-card motion-interactive block">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : null}
                <div className="exp-industry-card-overlay">
                  <h3 className="text-[15px] font-semibold text-white">{card.name}</h3>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/70">{card.description}</p>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
