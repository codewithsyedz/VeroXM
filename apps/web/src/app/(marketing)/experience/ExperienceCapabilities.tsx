import { DynamicIcon } from "../_components/DynamicIcon";
import type { CapabilityItem, StatItem } from "@/lib/veroxm-marketing";

export function ExperienceCapabilities({ capabilities, stats }: { capabilities: CapabilityItem[]; stats: StatItem[] }) {
  return (
    <section className="exp-section exp-section-alt">
      <div className="container">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {capabilities.map((cap) => (
            <div key={cap.title} className="surface-standard rounded-xl p-6">
              <span className="exp-capability-icon">
                <DynamicIcon name={cap.icon} className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold text-[var(--db-ink)]">{cap.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--db-ink-muted)]">{cap.description}</p>
            </div>
          ))}
        </div>
        <div className="mt-14 grid grid-cols-2 gap-y-8 border-t border-[var(--db-hairline-quiet)] pt-10 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="exp-stat-value">{s.value}</div>
              <div className="exp-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
