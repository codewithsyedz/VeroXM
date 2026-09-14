#!/usr/bin/env tsx
/**
 * Seeds (or re-seeds) the "VeroXM Marketing Site" CMS project (20) with
 * the same placeholder content originally created by hand through the
 * dashboard: 6 Trust Logos, 4 Case Studies, and the "marketing-page"
 * singleton that ties them together via relation fields.
 *
 * Idempotent: every entry is looked up first by a natural key (Trust
 * Logos by `name`, Case Studies by `href`, the Marketing Page singleton
 * by "does one already exist") and UPDATED in place if found, so running
 * this script again (e.g. after a fresh project import, or to reset
 * copy back to the placeholder baseline) never creates duplicates.
 *
 * Usage:
 *   npx tsx scripts/seed-veroxm-marketing-site.ts
 *
 * Requires (read from apps/web/.env, or already exported in the shell):
 *   VEROXM_MARKETING_SITE_PROJECT_ID   -- project 20's UUID
 *   VEROXM_MARKETING_SITE_SEED_API_KEY -- a key with Create+Read+Update
 *                                          (Developer > API Keys tab;
 *                                          NOT the read-only key the
 *                                          running app uses)
 *   VEROXM_SEED_BASE_URL               -- defaults to http://localhost:8080
 *                                          (the nginx gateway -- the ONLY
 *                                          port docker-compose publishes to
 *                                          the host in this project's stack).
 *                                          Deliberately NOT the `API_URL` var:
 *                                          that name is owned by the `web`/
 *                                          `api` containers' own docker-compose
 *                                          `environment:` block, where it means
 *                                          the container-internal address
 *                                          `http://api:4000` -- unreachable
 *                                          from your host terminal. Override
 *                                          only if your gateway is bound to a
 *                                          different host port.
 *
 * Media fields (logos, photos, the scale image, the case-study video
 * thumbnail) are deliberately left unset -- upload real assets through
 * the dashboard once you have them; this script only seeds text/JSON/
 * relation content.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { VeroXMApp } from "@veroxm/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// Minimal .env loader -- avoids adding a `dotenv` dependency just for this
// one script. Only fills in vars that aren't already set in the shell.
function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile(join(REPO_ROOT, "apps/web/.env"));

const PROJECT_ID = process.env.VEROXM_MARKETING_SITE_PROJECT_ID ?? "";
const API_KEY = process.env.VEROXM_MARKETING_SITE_SEED_API_KEY ?? "";
// Deliberately a dedicated var, NOT `API_URL` -- see the header comment above.
// (apps/web/.env sets API_URL=http://localhost:4000 for the containers'
// internal use; loadEnvFile() would silently adopt that unreachable value
// here if this script read the same name.) `||` (not `??`) so an empty
// placeholder value (e.g. VEROXM_SEED_BASE_URL="" in .env) also falls
// back to the default instead of resolving to an empty string.
const API_URL = process.env.VEROXM_SEED_BASE_URL || "http://localhost:8080";

if (!PROJECT_ID || !API_KEY) {
  console.error(
    "Missing VEROXM_MARKETING_SITE_PROJECT_ID / VEROXM_MARKETING_SITE_SEED_API_KEY.\n" +
      "Set them in apps/web/.env, or export them before running this script.\n" +
      "Issue a seed key from that project's Developer > API Keys tab with Create+Read+Update.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------
// Placeholder content -- mirrors what's already live; safe to edit and
// re-run to push copy changes.
// ---------------------------------------------------------------------

const TRUST_LOGOS: Array<{ name: string }> = [
  { name: "Tawuniya" },
  { name: "stc" },
  { name: "aramco" },
  { name: "SAB" },
  { name: "NEOM" },
  { name: "Red Sea Global" },
];

interface CaseStudySeed {
  [key: string]: unknown;
  title: string;
  quote: string;
  authorName: string;
  authorRole: string;
  companyName: string;
  href: string;
}

// First entry is the featured case study; the rest are "related stories".
const CASE_STUDIES: CaseStudySeed[] = [
  {
    title: "Tawuniya scales customer engagement across 12 digital touchpoints",
    quote:
      "VeroXM gave our team a single content backbone we could trust — what used to take weeks of coordination across departments now ships in days.",
    authorName: "Faisal Al-Rashid",
    authorRole: "Head of Digital Experience",
    companyName: "Tawuniya",
    href: "/case-studies/tawuniya",
  },
  {
    title: "stc modernizes its content operations with a composable stack",
    quote:
      "We replaced three disconnected CMS instances with one unified platform — our editorial velocity has never been higher.",
    authorName: "Lama Al-Otaibi",
    authorRole: "VP of Digital Platforms",
    companyName: "stc",
    href: "/case-studies/stc",
  },
  {
    title: "aramco streamlines enterprise publishing at global scale",
    quote:
      "VeroXM's API-first approach let our engineering teams build exactly the experiences our business needed, without waiting on the CMS vendor.",
    authorName: "Yousef Al-Mansour",
    authorRole: "Director of Enterprise Content Systems",
    companyName: "aramco",
    href: "/case-studies/aramco",
  },
  {
    title: "SAB delivers personalized banking content in record time",
    quote:
      "Our compliance and marketing teams finally work from the same source of truth — releases that took a quarter now take a sprint.",
    authorName: "Noura Al-Harbi",
    authorRole: "Head of Marketing Technology",
    companyName: "SAB",
    href: "/case-studies/sab",
  },
];

function marketingPageFields(ids: { trustLogoIds: number[]; caseStudyIds: number[] }) {
  const [featuredId, ...relatedIds] = ids.caseStudyIds;
  return {
    trustLogos: ids.trustLogoIds,
    navLogoText: "VeroXM",
    navLinks: [
      { label: "Product", href: "#product" },
      { label: "Solutions", href: "#solutions" },
      { label: "Customers", href: "#customers" },
      { label: "Pricing", href: "#pricing" },
    ],
    navCtaLabel: "Get a demo",
    navCtaHref: "/demo",
    heroEyebrow: "Composable Experience Management",
    heroHeading: "Ideas. People.",
    heroHeadingHighlight: "Impact.",
    heroSubheading:
      "VeroXM unifies content, teams, and channels into one connected system — so every idea reaches your audience faster, with measurable impact.",
    heroPrimaryCtaLabel: "Start free trial",
    heroPrimaryCtaHref: "/signup",
    heroSecondaryCtaLabel: "Watch demo",
    heroSecondaryCtaHref: "#demo-video",
    heroDashboardTitle: "Dashboard",
    heroDashboardStats: [
      { label: "Active Projects", value: "24" },
      { label: "Published This Week", value: "312" },
      { label: "Team Members", value: "48" },
    ],
    heroDashboardRecentActivity: [
      { title: "Homepage hero updated", time: "2m ago" },
      { title: "New case study published", time: "18m ago" },
      { title: "Q3 campaign launched", time: "1h ago" },
    ],
    heroFloatingCardOneText: "Ideas. People. Impact.",
    heroFloatingCardTwoText: "Publish Everywhere",
    trustHeading: "Trusted by leading organizations across the region",
    featuresHeading: "Everything your team needs to move fast",
    featuresSubheading:
      "From content modeling to multi-channel delivery, VeroXM gives every team the tools to ship with confidence.",
    featureCards: [
      {
        icon: "layers",
        title: "Composable Content",
        description: "Model any content type and reuse it across every channel, from web to mobile to kiosk.",
      },
      {
        icon: "users",
        title: "Built for Teams",
        description: "Role-based workflows and approvals keep marketing, legal, and engineering in sync.",
      },
      {
        icon: "zap",
        title: "Instant Publishing",
        description: "Push updates live in seconds with zero-downtime deploys and instant cache invalidation.",
      },
      {
        icon: "shield",
        title: "Enterprise-Grade Security",
        description: "SOC 2-ready infrastructure with granular permissions and full audit history.",
      },
    ],
    scaleHeading: "Scale your vision",
    scaleDescription:
      "As your organization grows, VeroXM grows with it — handling millions of content requests across dozens of markets without missing a beat.",
    scaleStats: [
      { value: "99.99%", label: "Uptime SLA" },
      { value: "120+", label: "Markets served" },
      { value: "3.2B", label: "Monthly API requests" },
    ],
    caseStudyHeading: "See how leading teams use VeroXM",
    featuredCaseStudy: featuredId,
    relatedCaseStudies: relatedIds,
    ctaHeading: "Ready to bring your ideas to life?",
    ctaDescription: "Join hundreds of teams using VeroXM to build faster, publish everywhere, and measure what matters.",
    ctaPrimaryLabel: "Start free trial",
    ctaPrimaryHref: "/signup",
    ctaSecondaryLabel: "Talk to sales",
    ctaSecondaryHref: "/contact",
    footerTagline: "VeroXM is the composable experience management platform for teams who move fast.",
    footerColumns: [
      {
        heading: "Product",
        links: [
          { label: "Features", href: "#features" },
          { label: "Pricing", href: "#pricing" },
          { label: "Integrations", href: "#integrations" },
          { label: "Changelog", href: "#changelog" },
        ],
      },
      {
        heading: "Company",
        links: [
          { label: "About", href: "#about" },
          { label: "Careers", href: "#careers" },
          { label: "Blog", href: "#blog" },
          { label: "Contact", href: "#contact" },
        ],
      },
      {
        heading: "Resources",
        links: [
          { label: "Documentation", href: "#docs" },
          { label: "Case Studies", href: "#case-studies" },
          { label: "API Reference", href: "#api" },
          { label: "Support", href: "#support" },
        ],
      },
      {
        heading: "Legal",
        links: [
          { label: "Privacy Policy", href: "#privacy" },
          { label: "Terms of Service", href: "#terms" },
          { label: "Security", href: "#security" },
        ],
      },
    ],
    footerNewsletterHeading: "Stay in the loop",
    footerNewsletterDescription: "Get product updates and best practices delivered to your inbox.",
    footerNewsletterPlaceholder: "Enter your email",
    footerSocials: [
      { platform: "LinkedIn", href: "https://linkedin.com/company/veroxm" },
      { platform: "X", href: "https://x.com/veroxm" },
      { platform: "YouTube", href: "https://youtube.com/@veroxm" },
    ],
    footerCopyright: "© 2026 VeroXM. All rights reserved.",
  };
}

// ---------------------------------------------------------------------

async function upsertByField(
  app: VeroXMApp,
  slug: string,
  matchField: string,
  matchValue: string,
  data: Record<string, unknown>,
): Promise<{ id: number; action: "created" | "updated" }> {
  const resource = app.content(slug);
  const existing = await resource.search({ where: [{ [matchField]: matchValue }], limit: 1 });
  if (existing.length) {
    const id = (existing[0] as { id: number }).id;
    await resource.update(id, data);
    return { id, action: "updated" };
  }
  const created = await resource.create(data);
  return { id: (created as { id: number }).id, action: "created" };
}

async function main() {
  const app = VeroXMApp.initializeApp({ baseUrl: API_URL, projectId: PROJECT_ID });
  app.auth.signInWithApiKey(API_KEY);

  console.log(`Seeding VeroXM Marketing Site (project UUID ${PROJECT_ID}) via ${API_URL} ...\n`);

  console.log("Trust Logos:");
  const trustLogoIds: number[] = [];
  for (const logo of TRUST_LOGOS) {
    const { id, action } = await upsertByField(app, "trust-logos", "name", logo.name, logo);
    trustLogoIds.push(id);
    console.log(`  ${action === "created" ? "+ created" : "~ updated"}  #${id}  ${logo.name}`);
  }

  console.log("\nCase Studies:");
  const caseStudyIds: number[] = [];
  for (const study of CASE_STUDIES) {
    const { id, action } = await upsertByField(app, "case-studies", "href", study.href, study);
    caseStudyIds.push(id);
    console.log(`  ${action === "created" ? "+ created" : "~ updated"}  #${id}  ${study.href}`);
  }

  console.log("\nMarketing Page (singleton):");
  const marketingPage = app.content("marketing-page");
  const existingPages = await marketingPage.list({ limit: 1 });
  const fields = marketingPageFields({ trustLogoIds, caseStudyIds });
  if (existingPages.length) {
    const id = (existingPages[0] as { id: number }).id;
    await marketingPage.update(id, fields);
    console.log(`  ~ updated  #${id}`);
  } else {
    const created = await marketingPage.create(fields);
    console.log(`  + created  #${(created as { id: number }).id}`);
  }

  console.log("\nDone. Media fields (logos, photos, scale image, video thumbnail) were left empty --");
  console.log("upload real assets through the dashboard when ready.");
}

main().catch((err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
