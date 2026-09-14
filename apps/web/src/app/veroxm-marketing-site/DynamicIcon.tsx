import { Layers, Users, Zap, ShieldCheck, Circle, type LucideIcon } from "lucide-react";

// Feature Cards JSON (see marketing-page.featureCards) stores icons as
// plain kebab-case name strings rather than Media Assets -- small
// monochrome glyphs, lighter-weight and still editable from the CMS
// without wiring up a media relation just to pick a glyph. An
// unrecognized name falls back to a plain dot rather than crashing.
const ICONS: Record<string, LucideIcon> = {
  layers: Layers,
  users: Users,
  zap: Zap,
  shield: ShieldCheck,
};

export function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Circle;
  return <Icon className={className} aria-hidden="true" />;
}
