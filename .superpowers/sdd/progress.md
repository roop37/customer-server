# Swiggy Dineout Phase 0 — SDD progress ledger

Base branch: dev → track/swiggymcp (customer-server, hoizr-client); hoizr-shared on main.
Shared linkage: local dist copy into node_modules (NO registry publish yet — deferred to user).
Execution: manual TDD (plan is tightly-coupled → plan's own decision tree routes to manual) + final adversarial workflow review.
Commits: HELD until user asks (standing rule). Build-only for now.

- [x] Task 1: hoizr-shared schema + enum built, smoke test passes, dist linked into customer-server (runtime+types verified)
- [x] Task 2: env vars + config reader — test passes
- [x] Task 3: token-crypto AES-256-GCM — test passes
- [x] Task 4: PKCE helpers — test passes
- [x] Task 5: identity hash + audit — test passes
- [x] Task 6: MCP client + helpers — test passes (fixed backoff cap defect from plan)
- [x] Task 7: oauth-state store + models + connection service — state test passes, tsc clean
- [x] Task 8: swiggy OAuth routes + registered in index.ts — tsc clean
- [x] Task 9: resolver + object type + registered — schema builds (status Q + disconnect M present)
- [x] Task 10: hoizr-client graphql+components+/dineout page — codegen OK, client tsc 0 errors (note: regen also synced stale dev schema drift)
- [x] Task 11: breach runbook + env docs (both .env.example) written
- [~] Final review: multi-agent adversarial workflow BLOCKED by session usage limit (resets 1:30am IST, all 5 reviewers erred before reading). Inline critical-path self-review done (crypto/OAuth-callback/vault-expiry/state-single-use/MCP-unwrap) — no defects. RE-RUN the workflow after reset for full adversarial coverage.

STATUS: Phase 0 code-complete. customer-server tsc 0 err, hoizr-client tsc 0 err, 6/6 backend test suites pass, TypeGraphQL schema builds (status Q + disconnect M), hoizr-client codegen OK.
NOT DONE (needs user/live): (1) git commits HELD; (2) hoizr-shared 0.1.120 publish DEFERRED (linked via local dist copy); (3) live OAuth round-trip (needs DCR client_id + real Swiggy acct); (4) re-run adversarial review workflow.

## 0.1.120 upgrade (user published) — 2026-07-17
- [x] All 3 servers bumped ^0.1.119 → ^0.1.120 (main-server npm, customer-server npm, hoizr-workers pnpm); all tsc 0 errors — upgrade broke none.
- [x] Local dist-copy hack replaced by the real published package in customer-server.
- [x] User added registerEnumType to SwiggyConnectionStatus in shared → wired the enum into SwiggyDineoutStatusResponse.status (was bare string); enum now in SDL + client SDK; re-codegen done; customer-server + hoizr-client tsc 0.
- [x] All 7 test suites (6 backend + shared smoke) pass against real 0.1.120.
- [x] Adversarial review COMPLETE: all 5 dimensions ran. 3 clean (security-crypto, compliance-walloff, spec-correctness). Findings fixed:
  * Important (2 dims, same bug): callback redirect was relative → 404'd on the API host (cross-origin). FIXED: SWIGGY_FRONTEND_RETURN env, absolute redirect mirroring Instagram idiom; behaviorally verified.
  * Minor (security path): consumeOAuthState get-then-del non-atomic. FIXED: Redis GETDEL (atomic single-use).
  * Secondary UX: DineoutClient ignored swiggy=denied/error. FIXED: outcome banner via useSearchParams.
- [x] Post-fix regression: 6/6 backend tests pass, schema+routes build, all 4 projects tsc 0 errors.

## Phases 1-3 (Discovery / Reservation / Management) — 2026-07-18
Approach: build full stack sequentially (TDD pure logic + tsc/schema-build/tests). Response `data` field names are prose-only in docs → isolated in ONE tolerant mapper (util/response-mapper.ts), marked verify-in-dev. Recipe-revealed paths: data.id, data.slots[].slotId, data.bookingId. Auth-fail → typed needsSwiggyAuth flag (not hard error, per spec §5.3). book_table follows the REFERENCE 7-arg table (not the 3-arg recipe). Commits still HELD.

- [x] P1 Discovery: deals+mapper pure-logic (TDD), inputs+objects, discovery service+resolvers, search hub + location picker + results. tsc/schema/tests green.
- [x] P2 Reservation: book_table w/ Redis SET-NX submit-lock + conservative check-then-retry (confirming flag), DineoutBooking upsert (success-only), detail page + slot picker + explicit confirm modal.
- [x] P3 Management: get_booking_status (poll-on-demand) + myDineoutBookings + reportDineoutError; My Reservations page; DineNearbyLink wired into event detail (reuses coordToLatLng; venue query omits coords by design).
- [~] Final review Phases 1-3: multi-agent workflow BLOCKED again by session limit (resets 7am IST; agents read 9-23 files each but erred mid-analysis). Inline critical-path self-review done:
  * FIXED (Important, build-breaker tsc can't see): /dineout page rendered DineoutClient (useSearchParams) with no Suspense boundary → `next build` CSR-bailout failure. Wrapped in <Suspense> (repo convention, cf. checkout/page.tsx). VERIFIED via full production build: compiled successfully, all 21 static pages generated, 3 dineout routes present, Done in 17.47s.
  * Reviewed clean: book_table Redis lock lifecycle (released on success/auth/hard-fail; held-with-TTL on ambiguous — no leak/wrong-release); DineoutBooking upsert success-only (L3); coordinate/lat-lng chain search→detail→book intact; other 2 pages use no useSearchParams.
  * RE-RUN the adversarial workflow after 7am for full coverage.

## Cross-stack verify (Phases 1-3): customer-server tsc 0, hoizr-client tsc 0, 8/8 backend tests, schema all 10 ops, codegen synced. Fixed strictNullChecks-off narrowing (flat result types). Commits still HELD.

## Whole-implementation review — 2026-07-18 (inline; multi-agent workflow blocked 3x by session caps)
Deterministic gates: tsc 0+0, 9/9 tests, prod build PASS, stale-greps clean (swapGeoToLatLng / API_BASE / #FC8019 / 0.1.108 all absent).
Dead-code sweep (every export usage-counted): all client lib exports used; internal helpers exported-for-test OK.
Findings fixed:
  1. bookTable: Mongo persist-throw after successful Swiggy booking no longer masks the confirmation (try/catch + booked_unrecorded audit line).
  2. bookTable: server-side trust-boundary validation (itemId non-empty, reservationTime>0, guestCount 1-20) → INVALID_BOOKING_INPUT.
  3. Client: guard before book (missing itemId/reservationTime → soft error, no garbage call).
  4. Client: "confirming" state now offers Check-my-reservations + Report-a-problem (wires ReportDineoutError per spec §7.3; closes the unused-op staleness).
  5. Removed dead isSwiggyCryptoConfigured (+ test assertion) — config gate already covers it.
  6. isRetryable/backoffMs marked STAGED (official retry doctrine; wire at live round-trip).
Kept deliberately: DineoutSavedLocations op (typed, awaits addressId verify-in-dev); response-mapper tolerance (the verify-in-dev seam).
Re-verified after fixes: tsc 0+0, 8/8 backend tests, prod build 13.1s PASS.

## Live-site polish — 2026-07-18
- [x] Hoizr sign-in gate on all 3 dineout surfaces (DineoutClient, DineoutBookings, DineoutRestaurantDetail): guestlist idiom (useAuthStore profile/hydrated/hydrate + useUIStore openSignIn → global SignInModal); data fetches gated on profile; logged-out users get the sign-in sheet instead of raw 401 JSON from /auth/swiggy/start.
- [x] NEXT_PUBLIC_INSTA_ENABLED flag (mirrors swiggy flag semantics: show only when "true"): gates InstagramConnectCard (profile) + EventInstagramAttendees (event detail + order detail "who's going") via hook-safe wrapper components — one guard per component covers all 3 call sites. .env.example documented; dev .env=true, prod stays false until Meta verification.
- [x] Verified: tsc 0, prod build PASS with INSTA=false + SWIGGY=true (12.1s).

## Sign-in re-enabled — 2026-07-18
- [x] HSide sidebar-foot "Sign in" + HProfileSheet mobile "Sign in" restored (were commented pending OTP delivery; MSG91 built, dev bypass exists).
- [x] SignInModal subheadline fixed (promised Google while the Google block stays hidden — its blocker is Google Cloud origin config, left as-is).
- [x] Verified: tsc 0, prod build PASS 11.0s. signedIn derives from authStore.profile in both — syncs after modal auth.
- Note: dev login = any phone + OTP 000000 (SERVER_ENV=development bypass, confirmed set). Prod delivery = MSG91 WA+SMS parallel (needs MSG91 provisioned). HFloatingAuth remains an unmounted orphan (superseded by sidebar foot).

## LIVE round-trip fixes — 2026-07-18 (user connected; "Not Acceptable" error)
Root cause: MCP Streamable HTTP requires Accept: application/json + text/event-stream (406 otherwise). Fixed + probed the live API with the vault token. REAL shapes (all mappers rewritten + tested against live samples):
- search: TEXT ONLY ("N. Name — cost | rating★ | cuisines | locality (ID: nnn)"); structuredContent={}. Text parser added.
- details: structuredContent.restaurant {avgRating, costForTwo, cuisines[], address, imageUrl, mastheadImageUrls[]}.
- slots: result._meta.slots[] {displayTime, slotGroupName, dateStr, reservationTime:"<epoch str>", deals:[{itemId, slotId, isFree, title, bookingPrice}]} — slotId ON THE DEAL (old mapper would drop ALL slots); response spans 7 days → service filters to requested date.
- saved_locations: structuredContent.data.locations[{index,id,addressLine,...}].
- unwrap order: structuredContent+_meta merged, else content[0].text (JSON→text fallback). SSE bodies parsed (responseType text + parseMcpHttpBody).
- Policy per Swiggy payload: paid deals RETAINED for display (free-first sort), free-only bookable; deal.slotId threaded through GraphQL→UI (books free deal's slotId).
VERIFIED live via service path: search 39 results, details rating 4.2/₹1500, slots Dinner:4 with full booking params, 7 locations. tsc 0+0, 8/8 tests, codegen synced. book_table/status mappers: tolerant + text fallback (exercised at first real booking).

## Venues page × Swiggy + venue events — 2026-07-18
- [x] /venues: Swiggy-connected customers get "Reserve a table" tab (default) with SwiggyVenuesGrid — city-aware (uiStore.city → getActiveIndianCities lat/lng → preset fallback), 7 nightlife filter chips (Pubs/Bars/Breweries/Lounges/Clubs/Rooftop/Cafes via entityType=RESTAURANT_CATEGORY or descriptive), free-text vibe search, dark bento-matched cards → /dineout/restaurant/[id]. "Hoizr venues" tab = existing grid, now city-filtered (graceful fallback to all when city has none).
- [x] Images: threaded imageUrl + mastheadImages (details-only; search is text-only) mapper→objects→resolver→fragment→UI; masthead photo strip on restaurant detail. LIVE-verified: 53 masthead photos for Koramangala SOCIAL.
- [x] Venue detail events: REUSED existing getOrganizerPastUpcomingEvents (deleted my duplicate getVenueEvents resolver/service/type after finding it) — render now buckets Happening now (pulse badge; upcoming-bucket + startDate<=now = ongoing) / Upcoming (soonest first) / Past events.
- [x] Verified: backend 8/8 + tsc 0; client tsc 0; prod build PASS 10.56s (earlier build fail = .next race with dev server, not code). Dev servers restored (:3009, :4001).

## Search enrichment + branding pass — 2026-07-18
- [x] Server-side detail enrichment: searchRestaurants enriches top 12 results via get_restaurant_details behind Redis cache (swiggy:details:<id>, TTL 15m) — images/rating/cost/cuisines merged into search cards; addressId path skipped (no coords). LIVE: 28 results, 12 enriched, warm run ~2x faster.
- [x] Found+fixed via live probe: search text segment order is cuisines|rating|cost|locality (not cost-first); details name trailing \t trimmed; test added w/ real populated line.
- [x] SwiggyVenuesGrid → photo cards (4/3 cover, scrim, floating ★ badge) matching the venue bento.
- [x] Branding pass: DineoutClient/DineoutSearch/DineoutRestaurantDetail/DineoutBookings restyled light→house dark (white/10 borders, rounded-2xl, acid #c5ff3d CTAs, dark modal #14141c, rose/amber/acid state banners). ConnectSwiggyButton stays Swiggy orange (mark context).
- [x] Verified: tsc 0+0, 8/8 tests, prod build PASS, dev servers restored.

## Full enrichment + event-detail-style reservation page — 2026-07-18
- [x] Enrichment now covers ALL search rows (cap 40, batched waves of 8, redis-cached). LIVE: 28/28 with images incl. bottom row; cold 4.8s uncached, warm ~1s.
- [x] DineoutRestaurantDetail REBUILT in the event-detail mold using the house CSS classes (h-page h-detail, h-event-hero--landscape hero fed by Swiggy masthead, h-detail-heading/title/line, h-detail-section "Reserve a table"): hero → rating/cuisines/cost line → highlight chips → gallery thumbs → 7-day IST date chips (slots refetch per date, new capability) → guests → band slot pills → dark confirm modal. All booking logic/guards unchanged.
- [x] Verified: tsc 0+0, prod build PASS, dev restored.

## 429 handling + house-idiom reservation UI — 2026-07-19
- [x] 429s live-confirmed → classifyMcpError(429)=rate_limited, friendly RATE_LIMIT_MESSAGE, Retry-After honored; callTool retry loop (backoff, default 2 retries) for READ tools; book_table retries:0 (non-idempotent).
- [x] Enrichment: waves 8→4 with 400ms gap; detailsCached signals RATE_LIMITED; loop aborts on first 429 to preserve the user's rate budget for slots/booking.
- [x] Reservation UI → house idiom (studied EventsPageClient/globals.css): h-chip+active (ink-inversion neon) for date chips, guest chips 1-8 (+9+ select), slot time pills w/ picked state; uppercase kicker band headings; dashed empty-card ("hop to another date"); pill skeleton loaders; rose error card with Try-again (retryTick refires same-date fetch, error cleared on refetch). SwiggyVenuesGrid filters + venues tabs → same h-chip idiom.
- [x] tsc 0+0, prod build PASS 11.4s, dev restored.

## Swiggy NIGHT FEATURES (Dinner-before-doors / Your-night / Tonight-rail) — 2026-07-21
Plan: docs/superpowers/plans/2026-07-21-swiggy-night-features.md. Subagent-driven. Commits HELD.
- [x] Task 1: client foundation — useSwiggyConnected hook (module-cached, fail-open-on-transient), IST/doors helpers, DineoutRestaurantCard extract, SwiggyVenuesGrid rewired. Spec✅ Quality-approved, tsc 0.
- [x] Task 2: server dineoutTonightRail — citySlug (TDD), shared city Redis cache (15m), enrichMax cap. Spec✅; fixed Important (skip cache write on throttle/empty → no degraded city-wide fill via new ToolResult.throttled flag). Minor stampede/single-flight noted for final review. tsc 0, schema live.
- [x] Task 3: DineoutTonightRail graphql op + codegen (done inline — trivial mechanical). SDK method generated, tsc 0.
- [x] Task 4: Dinner-before-doors card (order-page cream tokens, 7-day-window+future guards) + doors-aware deep-link chain (order→/dineout→search→restaurant page→detail). Spec✅ Quality-approved; fixed Important (doors ✓ badge+explainer now gated showDoorsBadge=selectedDate===eventDate — no false badge on non-event dates). tsc 0.
- [x] Task 5: Your-night itinerary (tonight tickets+tables merged, IST-filtered, time-sorted; doors-aware cross-sell; allSettled failure isolation; renders null when nothing on). Mounted /orders tickets-tab + /dineout. Spec✅ Quality-approved; fixed Minor1 (cross-sell targets EARLIEST tonight event not latest-purchased). Minor2 (booking-status filter) left — no verified Swiggy terminal-status vocabulary; hiding a real table is worse. tsc 0.
- [x] Task 6: Tonight-near-you rail island (silent-fail, city-cached, DineoutRestaurantCard+RailHead) mounted home+/live. Spec✅.

## NIGHT FEATURES — final whole-branch review DONE 2026-07-21
Reviewed all 6 tasks (5 individually + final broad pass on Task 6/cross-cutting/deferred-Minors, opus). No Critical/Important. Shared gate dedup verified (1 status req across N surfaces); no per-user Swiggy calls from home/list; no PII in caches; PoweredBySwiggy on all surfaces. Fixed 2 final Minors (resetSwiggyConnectedCache on disconnect → no stale-connected; rail setCards(null) on city change → no old-city/new-coords desync) + 1 compliance copy nit. 3 deferred Minors adjudicated KEEP (rail single-flight = per-user token so no concentration; YourNight status-filter = no verified terminal vocab; window-const dup = trivial).
LIVE-verified: railTonight 8 image-cards cold 3.2s, cache written, warm hit 0ms zero-Swiggy-calls.
FINAL: customer-server tsc 0, hoizr-client tsc 0, backend 9/9, prod build PASS, dev restored. All UNCOMMITTED (commits held).

## Dineout RESERVATION REMINDERS — 2026-07-21
Plan: docs/superpowers/plans/2026-07-21-dineout-reservation-reminders.md. Customer-only (owner-comms impossible/non-compliant via Swiggy). Gated SWIGGY_DINEOUT_REMINDERS_ENABLED (ship dark). Email live + WA/SMS dormant (isWhatsAppLive + approved template). Commits HELD; shared publish 0.1.121 DEFERRED to user (local dist-link for dev). hoizr-workers on dev → branch track/swiggymcp at commit time.
- [x] Task 1: shared — CUSTOMER_DINEOUT_RESERVED/_REMINDER + DineoutBooking.reminderSentAt; built, smoke passes, local-linked into cs+wk (both see new types). Publish 0.1.121 DEFERRED to user.
- [x] Task 2: customer-server notifier — reservation-notify.ts (email always + WA dormant behind isWhatsAppLive+template), gated remindersEnabled, fire-and-forget confirmation hook in bookTable success path. Subagent hit session limit mid-task; controller finished (fixed implicit-any catch). Bonus: reused shared customerPhoneForWhatsApp helper. tsc 0, test passes.
- [x] Task 3: hoizr-workers — DineoutBookingModel registered+exported; 2 lifecycle .hbs (FLAT accessors {{restaurantName}} etc — subagent correctly caught plan's {{data.foo}} would render empty; worker spreads data flat, verified L67); registry entries keyed by enum (tsc-proven); subjects inline in registry (email-subjects.ts is NOT the subject source — subagent correct). tsc 0.
- [ ] Task 4: hoizr-workers — reminder cron (scan/claim/dispatch) + scheduler
- [ ] Task 5: cross-repo verify + env docs
