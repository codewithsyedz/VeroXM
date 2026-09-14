import "server-only";
import { cache } from "react";
import { VeroXMApp } from "@veroxm/sdk";
import type { RawMediaRef } from "./veroxm-media";

// JSON-typed CMS fields (navLinks/featureCards/stats/footerColumns/
// capabilities/footerSocials, etc.) come back from the public API as raw
// strings -- the API's content-shaping layer only parses a handful of
// known field types (media/relation/boolean/number/multi_enumeration);
// anything else, including "json", falls through its `default` case
// untouched (see apps/api/src/public-api/public-content.service.ts
// shapeContent()). So every JSON-field value the SDK hands back here
// still needs one JSON.parse() before it matches its TS interface.
function parseJsonField<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// Server-only client for the (marketing) route group -- reads veroXM
// Landing's own project (project 12, UUID below) through the public API
// the exact same way any third-party app using @veroxm/sdk would, just
// running server-side so the static API key never reaches the browser.
// See apps/web/.env(.example) for VEROXM_MARKETING_*.

const PROJECT_ID = process.env.VEROXM_MARKETING_PROJECT_ID ?? "";
const API_KEY = process.env.VEROXM_MARKETING_API_KEY ?? "";

let appInstance: VeroXMApp | null = null;

function getApp(): VeroXMApp {
  if (!appInstance) {
    if (!PROJECT_ID || !API_KEY) {
      throw new Error(
        "VEROXM_MARKETING_PROJECT_ID / VEROXM_MARKETING_API_KEY are not set -- see apps/web/.env.example.",
      );
    }
    appInstance = VeroXMApp.initializeApp({
      baseUrl: process.env.API_URL ?? "http://api:4000",
      projectId: PROJECT_ID,
    });
    appInstance.auth.signInWithApiKey(API_KEY);
  }
  return appInstance;
}

/** Everything project 12's "veroxm-main-page" singleton nests as relations -- one call gets the whole landing page's content. */
export interface VeroXMMainPage {
  id: number;
  meta: {
    title: string;
    description: string;
    ogtitle: string;
    ogdescription: string;
    twittertitle: string;
    twitterdescription: string;
    twittercard: string;
    favicon: RawMediaRef | null;
    ogimage: RawMediaRef | null;
  };
  common: {
    companyname: string;
    buttons: {
      bookdemo: string;
      explore: string;
      learnmore: string;
      morefeatures: string;
      morequestions: string;
      subscribe: string;
    };
    alt: {
      header: string;
      headericon: RawMediaRef | null;
      binoculars: string;
      binocularicon: RawMediaRef | null;
      presentation: string;
      presentationicon: RawMediaRef | null;
      subscribe: string;
      subscribeicon: RawMediaRef | null;
    };
  };
  hero: {
    tagline: string;
    heading1: string;
    heading2: string;
    subheading: string;
  };
  features: {
    badge: string;
    heading1: string;
    heading2: string;
    subheading: string;
    image: RawMediaRef | null;
    "alt-flag": string;
    cards: Array<{
      id: number;
      title: string;
      classname: string | null;
      icon: RawMediaRef | null;
    }>;
  };
  advantages: {
    badge: string;
    heading: string;
    description: string;
    stats: Array<{ id: number; label: string; value: string }>;
    teams: Array<{ id: number; name: string; icon: RawMediaRef | null }>;
  };
  cms: {
    badge: string;
    heading: string;
    subheading: string;
    features: Array<{
      id: number;
      title: string;
      description: string;
      position: string;
      icon: RawMediaRef | null;
      image: RawMediaRef | null;
    }>;
  };
  trustedsectors: {
    badge: string;
    heading: string;
    subheading: string;
    sectors: Array<{ id: number; name: string; icon: RawMediaRef | null }>;
    card: {
      description: string;
      button: string;
      benefits: unknown[];
    };
  };
  cta: {
    heading: string;
    subheading: string;
  };
  faqs: {
    heading: string;
    items: Array<{ id: number; question: string; answer: string; order: number }>;
  };
  footer: {
    address: string;
    copyright: string;
    email: string;
    links: { privacy: string; twitter: string; instagram: string };
    newsletter: { heading: string; description: string; placeholder: string };
  };
}

// Cached per-request (React's cache()) -- the layout and the page both
// need this, and this dedupes them into a single SDK call.
export const getMainPageContent = cache(async (): Promise<VeroXMMainPage> => {
  const app = getApp();
  const [first] = await app.content<VeroXMMainPage>("veroxm-main-page").list({ limit: 1 });
  if (!first) throw new Error("veroxm-main-page returned no published entry.");
  return first;
});

export const MARKETING_PROJECT_ID = PROJECT_ID;

// ---------------------------------------------------------------------
// Multi-theme landing page system -- the "site-settings" singleton picks
// which of three themes the (marketing) route renders (see
// (marketing)/layout.tsx / page.tsx). "obsidian" is the original,
// dashboard-matched theme above (VeroXMMainPage / getMainPageContent);
// "impact" and "experience" are two new close rebuilds of a pair of
// reference marketing-site screenshots, each with its own CMS schema
// (theme-impact / theme-experience singletons, plus their own media-
// bearing child collections) so every visual component stays editable
// from the dashboard the same way the rest of this site already is.
// ---------------------------------------------------------------------

export type ThemeId = "obsidian" | "impact" | "experience";

export interface SiteSettings {
  id: number;
  activeTheme: ThemeId;
}

export const getSiteSettings = cache(async (): Promise<SiteSettings | null> => {
  const app = getApp();
  const [first] = await app.content<SiteSettings>("site-settings").list({ limit: 1 });
  return first ?? null;
});

// Defaults to "obsidian" (the original theme) if the singleton is
// missing or its enum value is somehow unset -- never let a bad/absent
// CMS row take the whole marketing site down.
export const getActiveTheme = cache(async (): Promise<ThemeId> => {
  try {
    const settings = await getSiteSettings();
    return settings?.activeTheme ?? "obsidian";
  } catch {
    return "obsidian";
  }
});

export interface NavLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  heading: string;
  links: NavLink[];
}

export interface StatItem {
  value: string;
  label: string;
}

// --- Theme: Impact (light/blue close rebuild) -------------------------

export interface ClientLogo {
  id: number;
  name: string;
  logo: RawMediaRef | null;
}

export interface CaseStudy {
  id: number;
  title: string;
  quote: string;
  authorName: string;
  authorRole: string;
  companyName: string;
  companyLogo: RawMediaRef | null;
  videoThumbnail: RawMediaRef | null;
  href: string;
}

export interface FeatureCardItem {
  icon: string;
  title: string;
  description: string;
}

export interface ThemeImpactContent {
  id: number;
  navLinks: NavLink[];
  heroHeading: string;
  heroSubheading: string;
  heroCtaLabel: string;
  heroCtaHref: string;
  heroSecondaryLabel: string;
  heroSecondaryHref: string;
  heroImage: RawMediaRef | null;
  publishLabel: string;
  publishIcon: RawMediaRef | null;
  logos: ClientLogo[];
  featureCards: FeatureCardItem[];
  statsImage: RawMediaRef | null;
  stats: StatItem[];
  caseStudies: CaseStudy[];
  ctaHeading: string;
  ctaSubheading: string;
  ctaButtonLabel: string;
  ctaButtonHref: string;
  footerColumns: FooterColumn[];
  footerBrandText: string;
  footerCopyright: string;
}

export const getThemeImpactContent = cache(async (): Promise<ThemeImpactContent> => {
  const app = getApp();
  const [first] = await app.content<ThemeImpactContent>("theme-impact").list({ limit: 1 });
  if (!first) throw new Error("theme-impact returned no published entry.");
  return {
    ...first,
    navLinks: parseJsonField<NavLink[]>(first.navLinks, []),
    featureCards: parseJsonField<FeatureCardItem[]>(first.featureCards, []),
    stats: parseJsonField<StatItem[]>(first.stats, []),
    footerColumns: parseJsonField<FooterColumn[]>(first.footerColumns, []),
  };
});

// --- Theme: Experience (dark/violet close rebuild) ---------------------

export interface QuoteItem {
  id: number;
  quote: string;
  authorName: string;
  authorRole: string;
  photo: RawMediaRef | null;
}

export interface IndustryCard {
  id: number;
  name: string;
  image: RawMediaRef | null;
  description: string;
  href: string;
}

export interface CapabilityItem {
  icon: string;
  title: string;
  description: string;
}

export interface SocialLink {
  icon: string;
  href: string;
}

export interface ThemeExperienceContent {
  id: number;
  navLinks: NavLink[];
  eyebrow: string;
  heroHeadingPre: string;
  heroHeadingEmphasis: string;
  heroSubheading: string;
  heroCtaLabel: string;
  heroCtaHref: string;
  quotes: QuoteItem[];
  capabilities: CapabilityItem[];
  stats: StatItem[];
  industries: IndustryCard[];
  ctaHeading: string;
  ctaSubheading: string;
  ctaButtonLabel: string;
  ctaButtonHref: string;
  footerColumns: FooterColumn[];
  footerSocials: SocialLink[];
  footerCopyright: string;
}

export const getThemeExperienceContent = cache(async (): Promise<ThemeExperienceContent> => {
  const app = getApp();
  const [first] = await app.content<ThemeExperienceContent>("theme-experience").list({ limit: 1 });
  if (!first) throw new Error("theme-experience returned no published entry.");
  return {
    ...first,
    navLinks: parseJsonField<NavLink[]>(first.navLinks, []),
    capabilities: parseJsonField<CapabilityItem[]>(first.capabilities, []),
    stats: parseJsonField<StatItem[]>(first.stats, []),
    footerColumns: parseJsonField<FooterColumn[]>(first.footerColumns, []),
    footerSocials: parseJsonField<SocialLink[]>(first.footerSocials, []),
  };
});
