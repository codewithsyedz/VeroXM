import type { VeroXMMainPage } from "@/lib/veroxm-marketing";
import { ArrowRight } from "lucide-react";

export function CtaSection({ cta, bookDemoLabel }: { cta: VeroXMMainPage["cta"]; bookDemoLabel: string }) {
  return (
    <section className="mkt-section">
      <div className="container">
        <div className="surface-feature relative overflow-hidden rounded-3xl px-8 py-16 text-center sm:px-16">
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ background: "radial-gradient(circle at 50% 0%, rgba(69,49,224,.35), transparent 60%)" }}
            aria-hidden="true"
          />
          <h2 className="mkt-heading mx-auto max-w-2xl">{cta.heading}</h2>
          <p className="mkt-subheading mx-auto">{cta.subheading}</p>
          <a href="#book-a-demo" className="button-primary motion-interactive mx-auto mt-8 w-fit px-6 text-[13px]">
            {bookDemoLabel} <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
