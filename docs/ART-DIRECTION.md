# APERTURE — Art Direction for myCMS

*One design system, two tempos: a cinematic front door for the world, a calmer working instrument for the team behind it.*

---

## Visual narrative

Most CMS marketing sites sell a feature grid. This one sells a *place*: myCMS is framed not as software but as a private atelier — a darkened, precisely lit room where content is handled the way a colorist handles film, or a jeweller handles a stone. The governing image is the **aperture**: a camera iris opening to admit exactly the right amount of light, closing again to protect what's inside. It gives the brand a literal and metaphorical home — *capture*, *focus*, *exposure*, *frame* — without resorting to camera-shop clichés, because the aperture motif is used structurally (as a transition, a loading state, a focus ring) rather than decoratively.

The narrative arc a visitor moves through on the marketing site: **intrigue** (a nearly-empty dark frame, a single point of light) → **reveal** (the aperture opens onto real content, treated like an object on display) → **proof** (the working instrument, shown in use, lit like a demonstration in a private studio) → **invitation** (a considered, unhurried call to action — this is a room you're invited into, not a form you fill out).

The dashboard carries the same visual DNA — obsidian surfaces, brass accents, the same type pairing — but the narrative shifts from *spectacle* to *instrument*. Once someone is inside the atelier working, the room gets quieter: less motion, more information density, faster response. Same building, different room.

## Art direction

The reference world is a **film-grading suite after hours**: low ambient light, one warm key light per surface, brushed-metal fittings, a single point of visual interest at a time. Nothing competes for attention because nothing is allowed to — nothing is more Web-2010-SaaS than five simultaneous accent colors and a hero illustration of little floating cards. Here, restraint *is* the luxury signal: nearly every screen is 90% negative space and dark surface, with one lit subject.

Content itself — a blog post, a product page, a media asset — is treated as **an object under glass**, not a row in a table. Even the dashboard's content list borrows the language of a museum vitrine: soft shadow, a thin rim of light along one edge, generous surrounding space, as if each record were laid out for inspection rather than crammed into a spreadsheet.

## Typography

Two typefaces, doing two different jobs, mirroring the marketing/dashboard split:

- **Voice (editorial, slow):** a high-contrast display serif for headlines, pull-quotes, and the marketing site's narrative copy — something in the family of *GT Sectra*, *Canela*, or *Reckless Neue* (final license pick TBD; if a fully free equivalent is needed, *Fraunces* at a high optical-size setting gets close). Set large, set loose, never justified.
- **Instrument (precise, fast):** a geometric grotesk for UI, labels, data, and all dashboard copy — *Neue Montreal* or *General Sans* as the premium pick, *Inter* as the pragmatic fallback that still reads clean at small sizes.

| Role | Typeface | Size / tracking | Where |
|---|---|---|---|
| Hero display | Voice serif | 72–140px, tight leading, slightly negative tracking | Marketing hero, section openers |
| Section title | Voice serif | 32–48px | Marketing sections, dashboard page titles (the one place the dashboard borrows Voice) |
| Body / narrative | Voice serif italic or Instrument regular | 18–20px, generous leading (1.6) | Marketing copy |
| UI label / data | Instrument | 12–14px, uppercase, +4% tracking for labels | Buttons, table headers, form labels |
| Dashboard body | Instrument | 14–16px | Content fields, tables, forms |

The contrast between the two families is the whole point: it should feel like reading a caption card next to a museum piece, then picking up the precision tool used to place it there.

## Color palette

A graded, desaturated palette — closer to film color grading than a UI style guide. One metal accent, used sparingly enough that it always reads as intentional.

| Token | Hex | Use |
|---|---|---|
| `obsidian` (base) | `#0B0B0D` | Marketing background, deepest surface |
| `graphite` (surface) | `#17181B` | Dashboard panels, cards, raised surfaces |
| `ash` (border/hairline) | `#2A2B2F` | 1px hairlines, dividers — never pure white |
| `bone` (primary text) | `#F2EDE4` | Headlines, primary text — warm off-white, never `#FFFFFF` |
| `smoke` (secondary text) | `#9A968E` | Secondary/meta text |
| `iron` (tertiary text/icon) | `#6F6C66` | Inactive nav icons, tertiary labels, meta separators — one step quieter than `smoke` |
| `brass` (accent) | `#C9A66B` | The one accent: focus rings, active nav, primary CTA, the aperture motif itself |
| `brass-dim` (accent, muted) | `#7A6647` | Hover/disabled states of the accent |
| `verdigris` (positive/live) | `#3E5C50` | Published/live status — deliberately desaturated, not SaaS-green |
| `oxblood` (destructive) | `#5C2A32` | Trash/delete states — desaturated, not alarm-red |

No pure black, no pure white, anywhere — both read as cheap under this lighting concept. Status colors are muted enough to sit quietly in a dark UI without turning the dashboard into a Christmas tree of badges.

## Composition

**Marketing:** asymmetric, off-center framing borrowed from cinematography — subjects sit on a rule-of-thirds point, never dead-center, with the "empty" two-thirds doing the atmospheric work (gradient, grain, a single drifting light). Sections are "scenes," not stacked cards — full-viewport-height, one idea each, meant to be moved *through* via scroll rather than scanned.

**Dashboard:** a disciplined, information-dense grid underneath the same material language — a left-hand navigation rail (dark, minimal, icon + label), a main content plane treated as the "light table," and contextual panels that slide in from the right as glass overlays rather than full navigations, so the working user never loses their place. Density goes up, motion goes down, but the hairlines, corner radii (a consistent 6px — sharp enough to feel precise, not a soft consumer-app bubble), and shadow language stay identical to the marketing site.

## Materials

Surfaces read as **brushed metal, smoked glass, and dark leather-adjacent texture** — implied, not skeuomorphically rendered. In practice: cards and panels get a near-imperceptible noise/grain overlay (3–4% opacity) so surfaces never look like flat digital gradients; modals and overlays use a frosted-glass treatment (backdrop-blur + a hairline brass edge) evoking museum vitrine glass; the brass accent is rendered with a subtle gradient (not a flat fill) so it catches light rather than sitting as a solid color swatch.

## Lighting

One key light per screen, always. On the marketing site, this is a soft radial glow that follows scroll position or cursor — never harsh, always falling off into the obsidian base within a short radius, so attention is directed rather than distributed. Cards and panels get a **1px rim-light** on their upper edge (a slightly-brighter-than-border line) suggesting a light source above the frame, consistent across marketing and dashboard. Vignetting — a subtle darkening toward the viewport's edges — keeps focus centered on hero content without a visible hard edge.

## Atmosphere

The target feeling is **"museum after hours"**: quiet, confident, unhurried, slightly reverent. A faint, constant film-grain texture sits over the entire experience at very low opacity — enough to keep the dark surfaces from feeling like a flat OLED void, not enough to read as a gimmick. Silence is used deliberately: no auto-playing video with sound, no chat-widget pop-up, no urgency banners. The dashboard keeps this atmosphere but turns the volume down further — it's the same room with the house lights partially up, because someone is trying to get work done in it.

## Depth

Three-layer parallax on the marketing site: a background layer (slow-drifting dust/light particles, barely perceptible), a midground layer (the content/product being "displayed," the actual subject), and a foreground framing layer (a soft vignette or an aperture-ring graphic that appears to sit closest to the viewer). Each layer moves at a different scroll-speed to sell genuine depth rather than a flat parallax trick. The dashboard trades parallax for **z-axis layering via elevation**: base plane (content table) → raised plane (cards, modals) → glass overlay plane (contextual panels) — communicated through shadow and blur intensity rather than motion, since a working screen shouldn't be drifting while someone types.

## Motion language

A single custom easing curve family, used at two different tempos. The curve itself is a mechanical-iris feel — a slow, weighted ease-out with a faint, damped settle at the end (not a bounce), like a camera aperture closing to exactly the right stop rather than snapping shut. On the **marketing site**, this plays at slow tempo (400–700ms transitions, section reveals as an iris-wipe/circular mask opening from a point rather than a fade or slide). On the **dashboard**, the same curve plays at fast tempo (120–200ms) for hover/focus/panel-open states — so the product never feels like a different piece of software, just a faster-moving version of the same one. Hover states throughout favor a **glow bloom** (a soft brightness increase on the brass accent) over a hard color swap, keeping with the "light" motif rather than flat state-toggling.

## Conversion goal

The marketing site's primary conversion deliberately avoids generic SaaS self-serve language. Instead of "Sign up free," the funnel is framed as an invitation:

1. **Hero (intrigue):** no headline copy competing with a signup form — just the aperture motif opening onto a single, real piece of content, and one understated line of positioning copy.
2. **Proof (the work):** real dashboard moments, shown cinematically (screen content lit and framed like a product shot, not a plain screenshot) — this is where feature claims live, shown rather than listed.
3. **Trust:** client/brand marks treated as gallery placards (small, evenly spaced, quiet typographic treatment) rather than a dense logo-soup strip.
4. **The invitation:** primary CTA reads **"Enter the Atelier"** (request access / book a private walkthrough) rather than a self-serve signup — positioning the product as considered and selective, which is the luxury-brand playbook translated to SaaS. A secondary, lower-commitment CTA (**"Join the waitlist"** / email capture) exists for visitors not ready for the primary ask.

This does mean accepting a smaller top-of-funnel in exchange for a higher-intent one — worth flagging as a deliberate trade-off, not an oversight, since it's a meaningful departure from a conventional CMS marketing site's "start free" pattern.
