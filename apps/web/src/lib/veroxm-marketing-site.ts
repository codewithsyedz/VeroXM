import "server-only";
import { cache } from "react";
import { VeroXMApp } from "@veroxm/sdk";
import type { RawMediaRef } from "./veroxm-media";

// JSON-typed CMS fields (navLinks/featureCards/heroDashboardStats/etc.)
// come back from the public API as raw strings -- the API's
// content-shaping layer only parses a handful of known field types
// (media/relation/boolean/number/multi_enumeration); "json" falls
// through untouched (see apps/api/src/public-api/public-content.service.ts
// shapeContent()). So every JSON-field value needs one JSON.parse()
// before it matches its TS interface. Mirrors the same helper in
// veroxm-marketing.ts.
function parseJsonField<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// Server-only client for the new /veroxm-marketing-site route -- reads
// project 20 ("VeroXM Marketing Site") through the public API exactly the
// same way any third-party app using @veroxm/sdk would, just running
// server-side so the static API key never reaches the browser. See
// apps/web/.env(.example) for VEROXM_MARKETING_SITE_*.

const PROJECT_ID = process.env.VEROXM_MARKETING_SITE_PROJECT_ID ?? "";
const API_KEY = process.env.VEROXM_MARKETING_SITE_API_KEY ?? "";

let appInstance: VeroXMApp | null = null;

function getApp(): VeroXMApp {
  if (!appInstance) {
    if (!PROJECT_ID || !API_KEY) {
      throw new Error(
        "VEROXM_MARKETING_SITE_PROJECT_ID / VEROXM_MARKETING_SITE_API_KEY are not set -- see apps/web/.env.example.",
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

export const MARKETING_SITE_PROJECT_ID = PROJECT_ID;

export interface NavLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  heading: string;
  links: NavLink[];
}

export interface DashboardStat {
  label: string;
  value: string;
}

export interface ActivityItem {
  title: string;
  time: string;
}

export interface FeatureCardItem {
  icon: string;
  title: string;
  description: string;
}

export interface ScaleStat {
  value: string;
  label: string;
}

export interface SocialLink {
  platform: string;
  href: string;
}

export interface TrustLogo {
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
  photo: RawMediaRef | null;
  href: string;
}

/** Project 20's "marketing-page" singleton -- every section of the VeroXM marketing site landing page. */
export interface MarketingPageContent {
  id: number;
  trustLogos: TrustLogo[];
  navLogoText: string;
  navLinks: NavLink[];
  navCtaLabel: string;
  navCtaHref: string;
  heroEyebrow: string;
  heroHeading: string;
  heroHeadingHighlight: string;
  heroSubheading: string;
  heroPrimaryCtaLabel: string;
  heroPrimaryCtaHref: string;
  heroSecondaryCtaLabel: string;
  heroSecondaryCtaHref: string;
  heroDashboardTitle: string;
  heroDashboardStats: DashboardStat[];
  heroDashboardRecentActivity: ActivityItem[];
  heroFloatingCardOneText: string;
  heroFloatingCardTwoText: string;
  trustHeading: string;
  featuresHeading: string;
  featuresSubheading: string;
  featureCards: FeatureCardItem[];
  scaleHeading: string;
  scaleDescription: string;
  scaleImage: RawMediaRef | null;
  scaleStats: ScaleStat[];
  caseStudyHeading: string;
  caseStudyVideoThumbnail: RawMediaRef | null;
  featuredCaseStudy: CaseStudy | null;
  relatedCaseStudies: CaseStudy[];
  ctaHeading: string;
  ctaDescription: string;
  ctaPrimaryLabel: string;
  ctaPrimaryHref: string;
  ctaSecondaryLabel: string;
  ctaSecondaryHref: string;
  footerTagline: string;
  footerColumns: FooterColumn[];
  footerNewsletterHeading: string;
  footerNewsletterDescription: string;
  footerNewsletterPlaceholder: string;
  footerSocials: SocialLink[];
  footerCopyright: string;
}

export const getMarketingPageContent = cache(async (): Promise<MarketingPageContent> => {
  const app = getApp();
  const [first] = await app.content<MarketingPageContent>("marketing-page").list({ limit: 1 });
  if (!first) throw new Error("marketing-page returned no published entry.");
  return {
    ...first,
    navLinks: parseJsonField<NavLink[]>(first.navLinks, []),
    heroDashboardStats: parseJsonField<DashboardStat[]>(first.heroDashboardStats, []),
    heroDashboardRecentActivity: parseJsonField<ActivityItem[]>(first.heroDashboardRecentActivity, []),
    featureCards: parseJsonField<FeatureCardItem[]>(first.featureCards, []),
    scaleStats: parseJsonField<ScaleStat[]>(first.scaleStats, []),
    footerColumns: parseJsonField<FooterColumn[]>(first.footerColumns, []),
    footerSocials: parseJsonField<SocialLink[]>(first.footerSocials, []),
  };
});
