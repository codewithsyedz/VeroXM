"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { VeroXMMainPage } from "@/lib/veroxm-marketing";

export function Faqs({ faqs }: { faqs: VeroXMMainPage["faqs"] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const items = [...faqs.items].sort((a, b) => a.order - b.order);

  return (
    <section id="faqs" className="mkt-section">
      <div className="container max-w-3xl">
        <span className="eyebrow mkt-badge">FAQ</span>
        <h2 className="mkt-heading">{faqs.heading}</h2>

        <div className="mt-10 flex flex-col gap-3">
          {items.map((item) => {
            const isOpen = openId === item.id;
            return (
              <div key={item.id} className="surface-standard overflow-hidden rounded-xl">
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : item.id)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-[14px] font-semibold text-[var(--db-ink)]">{item.question}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--db-ink-quiet)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen ? (
                  <div
                    className="mkt-faq-answer px-5 pb-5 text-[14px] leading-relaxed text-[var(--db-ink-muted)]"
                    dangerouslySetInnerHTML={{ __html: item.answer }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
