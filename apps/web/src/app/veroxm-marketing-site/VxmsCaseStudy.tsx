import { PlayCircle } from "lucide-react";
import { mediaUrl } from "@/lib/veroxm-media";
import { MARKETING_SITE_PROJECT_ID, type CaseStudy } from "@/lib/veroxm-marketing-site";
import type { RawMediaRef } from "@/lib/veroxm-media";

export function VxmsCaseStudy({
  heading,
  videoThumbnail,
  featured,
  related,
}: {
  heading: string;
  videoThumbnail: RawMediaRef | null;
  featured: CaseStudy | null;
  related: CaseStudy[];
}) {
  if (!featured) return null;
  const thumb = mediaUrl(MARKETING_SITE_PROJECT_ID, videoThumbnail ?? featured.photo);
  const relatedStories = related.length ? related : [];

  return (
    <section className="vxms-section" id="customer-story">
      <div className="container">
        <span className="eyebrow vxms-badge">Customer story</span>
        <h2 className="vxms-heading">{heading}</h2>
        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="surface-standard vxms-case-study">
            <div className="vxms-case-study-media">
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="h-full w-full object-cover" />
              ) : null}
              <PlayCircle className="absolute h-14 w-14 text-white/90 drop-shadow-lg" aria-hidden="true" />
            </div>
            <div className="p-7">
              <p className="text-[15px] leading-relaxed text-[var(--db-ink)]">&ldquo;{featured.quote}&rdquo;</p>
              <div className="mt-4 text-[13.5px] font-semibold text-[var(--db-ink)]">
                {featured.authorName}
                <span className="ml-1.5 font-normal text-[var(--db-ink-muted)]">
                  {featured.authorRole}, {featured.companyName}
                </span>
              </div>
              {featured.href ? (
                <a href={featured.href} className="mt-4 inline-block text-[13px] font-semibold text-[var(--db-sapphire)]">
                  {featured.title} &rarr;
                </a>
              ) : null}
            </div>
          </div>
          <div>
            <h3 className="vxms-footer-heading mb-4">Related stories</h3>
            <ul className="flex flex-col gap-4">
              {relatedStories.map((story) => (
                <li key={story.id} className="surface-standard rounded-xl p-4">
                  <a
                    href={story.href || "#"}
                    className="text-[13.5px] font-semibold text-[var(--db-ink)] hover:text-[var(--db-sapphire)]"
                  >
                    {story.title}
                  </a>
                  <p className="mt-1 text-[12.5px] text-[var(--db-ink-muted)]">{story.companyName}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
