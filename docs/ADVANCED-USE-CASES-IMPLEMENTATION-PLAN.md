# Advanced Use Cases: Implementation Plan

**Prepared for:** Syed Raza
**Subject system:** VeroXM (`mycms-nextjs-nodejs`)
**Based on:** [`ADVANCED-USE-CASES-INTEGRATION-RECOMMENDATION.md`](./ADVANCED-USE-CASES-INTEGRATION-RECOMMENDATION.md) -- this plan turns that document's section 4 (A/B/C) into sequenced, estimated work items.
**Status:** Plan for review -- no code changes made as part of this document.

---

## 1. How to read this plan

**Estimates are ideal engineering days**, not calendar time: focused implementation + the kind of self-verification this engagement has consistently done (typecheck, live API/browser verification, fixing bugs found along the way), for one senior engineer already familiar with this codebase, working AI-pair-programming-assisted at roughly the pace this engagement has already demonstrated (e.g. the entire Tenant/RBAC/approval-workflow system landed in one recommendation document's implementation pass, per `RBAC-TENANT-RECOMMENDATION.md` §11). They deliberately exclude: calendar delay from context-switching, a formal QA pass, and security review -- call those out separately before anything here goes in front of real third-party traffic or customer data.

**Complexity tiers**, used consistently below:

| Tier | Meaning |
|---|---|
| **S** (Small) | Isolated module, no schema migration, no new external dependency or infrastructure. |
| **M** (Medium) | One new Prisma model/migration, or one new external dependency, contained to a few modules. |
| **L** (Large) | New infrastructure component (a new container, a new class of background process), or changes that cross both `apps/api` and `apps/web`. |
| **XL** (Extra-large) | Deep architectural change, or an open-ended integration surface where the first vendor is cheap but the pattern itself needs real design work. |

**Priority tiers** follow the dependency chain the recommendation doc's §5 already identified, expanded to cover every item in its §4:

- **P0 -- Foundation.** Nothing else meaningfully starts before these; build in this order.
- **P1 -- Immediate follow-on.** Unblocked the moment P0 ships; highest ratio of value to effort.
- **P2 -- Third-party connectors.** Each is a real, scoped integration in its own right, not just "turn on the webhook."
- **P3 -- Platform bets.** Bigger investments; worth a short design spike before committing to the full estimate.

---

## 2. Master summary

| # | Item | Priority | Complexity | Estimate | Depends on |
|---|---|---|---|---|---|
| 1 | Webhook/event engine | P0 | M--L | 6--9d | -- |
| 2 | API rate limiting | P0 | S | 1--2d | -- |
| 3 | Background job/queue infra (BullMQ + Redis) | P0 | L | 5--8d | -- |
| 4 | Read-path caching + cache-invalidation consumer | P1 | M | 4--6d | #1 |
| 5 | Multi-locale delivery (API + authoring UI) | P1 | M | 5--7d | -- |
| 6 | Reference webhook consumers (Slack/Teams, generic recipes) | P1 | S | 1--2d | #1 |
| 7 | Analytics/CDP instrumentation | P2 | S--M | 2--4d (web only); +3--5d (API-side) | -- |
| 8 | DAM/media pipeline (new `StorageProvider`s + transforms) | P2 | M | 4--6d per provider | -- |
| 9 | E-commerce/PIM sync (first vendor) | P2 | L--XL | 10--15d | #3 |
| 10 | AI-assisted authoring (draft/alt-text/summarize) | P2 | M | 6--9d | -- |
| 11 | Auto-tagging / relation suggestions | P2 | M | 4--6d | #10 |
| 12 | Content QA / pre-publish compliance check | P2 | S--M | 3--5d | #10 (shares `AiModule`) |
| 13 | Translation pipeline | P2 | M--L | 6--8d | #5, #10, #3 |
| 14 | Personalization (consumption-ranked relations) | P3 | L | 6--10d | #7 |
| 15 | Semantic/vector search | P3 | L--XL | 8--12d | #3 |
| 16 | Custom field-type plugin system | P3 | XL | 15--25d (+2--3d design spike first) | -- |

**Total, P0 + P1 (the foundation worth committing to now):** roughly 22--34 ideal engineering days.
**Total, everything through P2:** roughly 65--97 ideal engineering days, before P3.

---

## 3. P0 -- Foundation

### 3.1 Webhook/event engine

Doc ref: §4B.1. The single highest-leverage item -- most of §4A becomes "customer configures a URL," not new VeroXM code, once this exists.

**Steps:**
1. Prisma migration: `Webhook` (id, projectId, url, secret, subscribedEvents: string[] as JSON, enabled, createdAt) and `WebhookDelivery` (id, webhookId, event, payload, responseStatus, attempt, deliveredAt, failedAt) -- hand-written SQL, per this repo's own migration discipline (see `packages/db/sql/0006_create_tenants.sql` for the established pattern).
2. Install `@nestjs/event-emitter`; emit `content.published` / `content.updated` / `content.deleted` from `public-content-write.service.ts`, and `approval.requested` from `approval-workflows.service.ts`.
3. New `apps/api/src/webhooks/` module: `WebhooksService` (CRUD for a project's webhooks), a listener that resolves subscribed webhooks per event and delivers them -- HMAC-SHA256 signed payload in a header (`X-VeroXM-Signature`, the Stripe/GitHub pattern), single-attempt `fetch` for the first cut (retries move to the queue once #3 exists).
4. Dashboard UI: a "Webhooks" tab on the project nav, styled like the existing Developer/API-tokens tab (`AccessTokens.tsx` is the closest precedent) -- register a URL + event types, see a delivery log, a "send test event" button.
5. `docker/nginx/gateway.conf` -- new route block if this module's controller needs to be reachable directly (check against the `/permissions/`-vs-`/departments/` gotcha already documented in `RBAC-TENANT-RECOMMENDATION.md` §11.2 before adding one).

**Estimate:** 6--9 days (3--4 backend + delivery, 2--3 frontend, 1--2 hardening/testing).
**Definition of done:** creating/publishing a Case Study entry fires a signed POST to a registered test endpoint (verifiable the same way this engagement already verifies live behavior -- a `Claude_Browser` `fetch()`/webhook-receiver check) and shows up in the delivery log.

### 3.2 API rate limiting

Doc ref: §4B.3. Cheap, and protects the public API before more integrations lean on it.

**Steps:** install `@nestjs/throttler`; apply per-token (fall back to per-IP for v1 legacy tokens) limits on `v2-token.guard.ts` / `legacy-token.guard.ts`'s call path; make the limit configurable per project/token (schema already has `abilities` as a per-token JSON column -- a `rateLimit` field fits the same shape).

**Estimate:** 1--2 days.
**Definition of done:** a scripted burst against `/public/v2/projects/:id/content/:slug` returns `429` past the configured threshold, with a `Retry-After` header.

### 3.3 Background job/queue infrastructure

Doc ref: §4B.2. The one genuinely new piece of infrastructure in this plan.

**Steps:** add a `redis` service to `docker-compose.yml` (internal network only, no host port -- matching this stack's existing "nothing but the gateway is host-reachable" discipline); install `bullmq` + `ioredis`; a `JobsModule` wrapping queue creation; first real consumer is #3.1's webhook retry path (move delivery off the synchronous request path entirely, with exponential backoff and a dead-letter queue after N attempts visible in the delivery log).

**Estimate:** 5--8 days (2 infra/setup, 2--3 wiring retries onto it, 1--2 dead-letter/observability, 1 docs -- following this repo's `docs/DOCKER-DEV-SETUP.md` convention).
**Definition of done:** killing the receiving endpoint mid-test still results in a delivered webhook once it comes back, visible as multiple attempts in the delivery log.

---

## 4. P1 -- Immediate follow-on (unblocked once P0 ships)

### 4.1 Read-path caching + cache-invalidation consumer

Doc ref: §4B.4 + §4A.2. **Depends on #3.1.**

Redis-backed cache (reuses the Redis instance from #3.3) keyed by `project+collection+query`, invalidated by an internal listener on the same `content.updated`/`content.deleted` events #3.1 already emits -- no new event plumbing needed. A first-party "CDN purge" webhook target (a small built-in consumer calling the Cloudflare/Fastly purge API given a project's configured zone) ships as the reference integration proving the pattern end-to-end.

**Estimate:** 4--6 days.

### 4.2 Multi-locale delivery

Doc ref: §4B.5. No dependency on webhooks -- can run in parallel with 3.1--3.3 if a second engineer is available.

**Steps:** `?locale=` query param on `v2-content.controller.ts` / `public-content.service.ts` (fall back to `Project.defaultLocale` when omitted or the requested locale has no row); a locale switcher in `ContentForm.tsx`/`ContentList.tsx` so an editor can create/edit a per-locale variant of an entry; a `locale` option on `@veroxm/sdk`'s `content().list()/get()`.

**Estimate:** 5--7 days (2 API, 2--3 UI, 1 SDK + docs).
**Definition of done:** the same Case Study entry can have an `en` and `ar` row, and `GET .../content/case-studies?locale=ar` returns the Arabic variant.

### 4.3 Reference webhook consumers

Doc ref: part of §4A.1. **Depends on #3.1.** Once webhooks exist, Slack/Teams notification on `approval.requested`/`content.published` needs **no bespoke integration code** -- a customer (or VeroXM itself, internally) points the webhook URL at Slack's own Incoming Webhook endpoint. The only VeroXM-side work is a small library of documented recipes/presets in the Webhooks tab UI (a "Slack" preset that pre-fills the expected payload shape) -- not a Slack-specific backend integration.

**Estimate:** 1--2 days (UI presets + a docs page), directly closing the gap `RBAC-TENANT-RECOMMENDATION.md` flagged for the approvals bell.

---

## 5. P2 -- Third-party connectors

These are real, scoped integrations, not just "the customer configures a webhook."

### 5.1 Analytics/CDP instrumentation
Doc ref: §4A.3. GA4/PostHog/Segment snippet + event tracking on the marketing pages (`apps/web/src/app/(marketing)/`, `veroxm-marketing-site/`) is **2--4 days**, no backend dependency. Extending `api-analytics` to also record content-consumption events (which entry was read, from where) is a further **3--5 days** and is what personalization (#5.14) will eventually need.

### 5.2 DAM/media pipeline
Doc ref: §4A.5. Each new `StorageProvider` (Cloudinary, GCS, Azure Blob, R2) implementing the existing `storage-provider.interface.ts` is **4--6 days**, including a transformation pipeline built on the already-present `sharp` dependency (responsive variants, format conversion). No queue dependency for a single upload; batch/bulk reprocessing of existing media would want #3.3.

### 5.3 E-commerce/PIM sync (first vendor, e.g. Shopify)
Doc ref: §4A.4. **Depends on #3.3.** The harder direction: this is *inbound* (VeroXM receiving Shopify's own webhooks or polling its API), the mirror image of #3.1's outbound delivery -- a new inbound webhook-receiver endpoint (verifying Shopify's HMAC signature, the same primitive as #3.1 but consuming rather than producing), mapped onto a Product collection's `relation`/`json` fields via the existing SDK write path. A one-way sync (Shopify -> VeroXM) is the scoped version; two-way sync (VeroXM edits pushed back to Shopify) roughly doubles the estimate and adds real conflict-resolution design work.

**Estimate:** 10--15 days for one-way sync with a single vendor.

### 5.4 AI-assisted authoring
Doc ref: §4C.1. New `AiModule` wrapping an LLM API client (Anthropic/OpenAI), plus ContentForm actions: "Generate draft," "Suggest alt text" (feeds the already-`sharp`-processed image into a vision call), "Summarize into excerpt." Needs basic cost/rate guardrails (ties into #3.2's rate-limiting work, reused rather than rebuilt).

**Estimate:** 6--9 days.

### 5.5 Auto-tagging / relation suggestions
Doc ref: §4C.2. **Depends on #5.4's `AiModule`.** A prompt over candidate entries in a related collection, surfaced as non-committing suggestion chips in the `relation`-field UI -- an editor accepts or ignores, never an automatic write.

**Estimate:** 4--6 days once `AiModule` exists.

### 5.6 Content QA / pre-publish compliance check
Doc ref: §4C.4. **Depends on #5.4's `AiModule`.** A pass in the publish path flagging likely placeholder/lorem-ipsum-style leftovers -- surfaced as a warning via the already-existing `FlashBanner`/`InlineAlert` components, not a hard block. Directly aimed at the class of bug this engagement already caught by hand once (the collapsed Case Study fields during the marketing-site build).

**Estimate:** 3--5 days.

### 5.7 Translation pipeline
Doc ref: §4C.3. **Depends on #4.2 (locale delivery), #5.4 (`AiModule`), and #3.3 (queue -- translation calls are too slow to run inline).** On publish, queues one translation job per configured locale in `Project.locales`, landing as a new `Content` row with `locale` set and `draft: true` (`public-content-write.service.ts` already supports this) for human review.

**Estimate:** 6--8 days, assuming its three dependencies are already in place.

---

## 6. P3 -- Platform bets

### 6.1 Personalization
Doc ref: §4C.5. **Depends on #5.1's consumption analytics having real data.** A ranking service reordering `relation`-field output (e.g. `relatedCaseStudies`) at serve time from consumption signals. Technically buildable earlier, but pointless without enough traffic to rank on -- sequence this by data volume, not engineering readiness.

**Estimate:** 6--10 days.

### 6.2 Semantic/vector search
Doc ref: §4C.6 + the search-engine gap in §3. **Depends on #3.3** (indexing runs as a background job on `content.published`). Pick one vendor first (Meilisearch's built-in semantic search is the lowest-friction start given no existing search infra to migrate off of); an embeddings call (OpenAI/Voyage) per entry; a new public API endpoint alongside the existing `where`/`whereRelation` `search()`, not a replacement for it.

**Estimate:** 8--12 days for the first vendor.

### 6.3 Custom field-type plugin system
Doc ref: §4B.6. The biggest architectural bet here: `FIELD_TYPES` (`packages/shared-types/src/index.ts`) is a fixed union consumed by both the NestJS validation layer and the Next.js `FieldRenderer` today. Turning it into a genuine plugin registry -- third parties (or VeroXM itself) registering a "Stripe Price" picker or a "YouTube embed" resolver without a core schema change -- is a real design problem (validation contract, frontend rendering contract, migration path for the 13 existing types), not just new code.

**Recommendation:** run a 2--3 day design spike (a short recommendation doc, in the same style as this one) before committing to the full estimate, the same way the RBAC/Tenant work started with a recommendation doc before implementation.

**Estimate:** 15--25 days for a first working plugin contract plus one real third-party field type proving it, once the design is settled.

---

## 7. Suggested execution order

A linear path through the above, respecting every dependency arrow noted per item:

**Phase 1 (P0):** #1 webhook engine -> #2 rate limiting -> #3 queue infra. *(~12--19 days)*
**Phase 2 (P1):** #4 caching + cache-invalidation -> #5 locale delivery (parallelizable with #4) -> #6 reference webhook consumers. *(~10--15 days)*
**Phase 3 (P2, connectors):** #7 analytics -> #8 DAM providers -> #10 AI authoring -> #11 auto-tagging -> #12 QA checks -> #13 translation pipeline -> #9 e-commerce sync. *(~35--55 days, largely parallelizable across engineers since most don't depend on each other -- only #11/#12/#13 share #10's `AiModule`)*
**Phase 4 (P3):** #16's design spike first, then #14 personalization / #15 semantic search / #16 field-type plugins, in whatever order matches actual customer demand -- none of these are blocking anything else in this plan.

---

## 8. What this plan deliberately doesn't schedule

Identity/SSO federation, RBAC, multi-tenancy, and approval workflows -- already built or in progress per `IDENTITY-PLATFORM-RECOMMENDATION.md` and `RBAC-TENANT-RECOMMENDATION.md`. Security review, load testing, and formal QA for any P2/P3 item that will touch real third-party traffic or customer data -- scope those explicitly before shipping, not implicitly inside the estimates above.
