import {
  LayoutGrid,
  Users,
  ShieldCheck,
  Zap,
  Sparkles,
  Target,
  Send,
  BarChart3,
  Github,
  Linkedin,
  Twitter,
  Circle,
  type LucideIcon,
} from "lucide-react";

// Icons in CMS content (featureCards/capabilities/footerSocials JSON
// fields) are stored as plain kebab-case name strings rather than Media
// Assets -- they're small monochrome glyphs, not photography, so a
// lucide-react icon name is a lighter-weight, still-editable choice than
// wiring up a whole media relation just to pick a glyph. This maps the
// small fixed set either theme actually uses to their components; an
// unrecognized name falls back to a plain dot rather than crashing.
const ICONS: Record<string, LucideIcon> = {
  "layout-grid": LayoutGrid,
  users: Users,
  "shield-check": ShieldCheck,
  zap: Zap,
  sparkles: Sparkles,
  target: Target,
  send: Send,
  "bar-chart-3": BarChart3,
  github: Github,
  linkedin: Linkedin,
  twitter: Twitter,
};

export function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Circle;
  return <Icon className={className} aria-hidden="true" />;
}
