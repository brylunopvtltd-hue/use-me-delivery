# USE ME V3 — Phase 5 End-to-End Audit / 2026-10-17

## Scope & production policy
Audit from shop registration → platform Owner approval → authenticated Storage photo upload → product publication → customer marketplace checkout → Owner-only order management → opt-in GPS pickup/customer map → confirmed quote → order status / delivery / cancellation. **Approved Homepage design must remain byte-identical to the prior approved commit.**

**Do not touch existing customer/shop records for tests.** SQL tests created temporary identities, shops, product metadata and orders inside BEGIN … ROLLBACK. The existing real delivered order and shop statuses were left unchanged.

## Confirmed repairs committed and migrated
1. **Stock aggregation across duplicate cart lines:** `place_marketplace_order` now checks the *total* submitted quantity for each product before creating order or decreasing stock. Product row locks and SQL stock constraints remain.
2. **Least privilege:** removed anonymous INSERT/UPDATE/DELETE and anonymous/authenticated TRUNCATE privileges from `shops` and `products`; reviewed `orders` privileges (anonymous writes already disabled).
3. **Idempotent checkout:** `useme_order_requests` maps a unique request UUID to a single customer/order; `place_marketplace_order_once` and `place_service_order_once` return the existing order on repeat. Row lock protects same UUID against duplicate network retries. Table has RLS enabled and intentionally no browser policies; direct access is revoked.
4. **Browser retry handling:** both checkout forms use request fingerprints hashed by Web Crypto and session-scoped UUIDs; retries reuse an ID. If Web Crypto is unavailable, customer contact details remain only in memory, not persisted as plaintext. A successful database save is not misreported as a failed order when a subsequent list refresh fails.
5. **Product photo durability:** after committing a new image path, older photo removal is best-effort and cannot cause deletion of the newly referenced photo. Real JPEG/PNG/WebP Storage upload remains a real-account acceptance test.
6. **Publish validation:** require approved shop + pickup details, positive stock when **initially publishing**, a shop-folder image_path and an existing `storage.objects` record for a published product. Sold-out products can still replace an image; direct database manipulation cannot publish an image path with no Storage object.
7. **Photo deletion policy:** signed-in approved shop owner/USE ME Owner may delete *unreferenced* shop images only. Supabase Storage API manages deletion; direct SQL DELETE on storage.objects is deliberately prohibited.
8. **Owner-only order status:** owner authorization occurs *before* customer order lookup/row lock. Non-owner cannot read or change private customer order data via RLS and the protected status RPC.
9. **Protected status transitions:** final Owner quote required before accepting; no skipping from pending to delivered; repeated cancellation blocked; reserved marketplace stock returns once on first cancellation.
10. **Location and route controls:** customer/order GPS, private partner shop GPS, and Owner route map are still available. Customer and shop coordinates are opt-in snapshots; only Owner can view both for routing. Leaflet map tile loading and browser GPS permissions still need real-device tests.

## Reproducible rollback-only tests (NO production test records persisted)
- Temporary signed-in-role Shop Owner registered a shop, saved pickup GPS, and Owner approved it.
- Approved Shop Owner could insert **Storage metadata** (not binary bytes) and publish a photo-backed product.
- 5-stock item × duplicate cart lines with total quantity 6 was rejected **before** stock subtraction.
- Valid 2-item shop order created successfully; stock changed 5 → 3; order items and owner/customer notice operations executed.
- Temporary Seller role was denied order status modification; platform Owner quote was required before acceptance.
- Owner transitions: pending → accepted → preparing → ready → out_for_delivery → delivered; 5 status events; private shop and customer GPS snapshots were stored.
- Same request UUID submitted twice produced **1** marketplace order and 1 reservation (stock 5 → 3, not 1), and **1** service order.
- Null request ID was rejected; Owner fee override/service pause and unauthorized Settings actions were previously tested in Phase 4.
- Publishing with a nonexistent Storage object was rejected. After temporary Storage metadata was inserted, publishing succeeded. Sold-out active product with stock 0 could safely replace photo metadata.
- Nonowner set_order_status rejected before order lookup. Owner could not approve a real pending shop lacking pickup details (test rolled back).
- Pending → delivered direct skip and second cancellation were rejected.
- Tests use database role claims; **they are not genuine Supabase Auth browser sign-ins, nor tests of a physical Storage file.**

## Deploy & source checks
- GitHub branch: `use-me-v2-rebuild` in `brylunopvtltd-hue/use-me-delivery`.
- Files deployed to Cloudflare Worker `use-me-superapp-web`: `index.html`, Phase 4 Owner, Location, Team JS/CSS and existing assets, with correct JS/CSS MIME. Worker content GET confirmed updated names/function calls and 100% deployment traffic.
- Browser JS syntax checked for inline script and all external JS files; approved Home section compared **byte-for-byte** to approved GitHub commit `7f4e18f4720e7b38221aeadcb18c497c2b8e5d8c`.
- Cloudflare Browser Rendering returned **API rate-limit error 2001** on Phase 5 mobile route test. This means no new authenticated mobile screenshots, GPS permission dialogs or visual route interactions were verified in this run.
- Service Worker is network-first and retains an offline fallback; current online navigation fetches new pages.

## Production snapshot verified 2026-10-17
- 1 approved shop; 1 pending shop missing full pickup record (do not auto-approve).
- 0 real products, 0 uploaded product photo files in Storage bucket.
- 1 pre-existing delivered service/parcel order; this was never modified.
- 18 notification records (historical/customer activity; do not delete).
- Owner delivery pricing was not changed: minimum LKR 250, reference round-trip 22 km at LKR 750.
- Database advisory warnings still include leaked-password protection not enabled, authenticated SECURITY DEFINER RPC review, and performance/index advice. Anonymous `useme_public_config` is deliberately whitelisted for public pricing. `useme_order_requests` intentionally has RLS enabled with no browser policy.

## REAL ACCOUNT / MOBILE ACCEPTANCE TESTS — STILL REQUIRED
1. **Seller:** real signup/sign-in and shop registration with full pickup address; verify Owner-only approval. With an approved shop, upload an actual JPEG/PNG/WebP (up to 12 MiB), publish, change stock/price, replace image, refresh site.
2. **Customer:** use a separate real login; browse real product, add to cart, select location permission optionally, submit once and confirm exactly one pending order; retry same request under network disruption and verify idempotency.
3. **Owner:** log in as platform Owner; verify incoming owner notification, shop name and pickup address/phone, quantity and customer phone/address, quote confirmation and only Owner status buttons. Follow order from acceptance to delivered. Verify seller account cannot see customer order or GPS.
4. **GPS/map:** mobile browser permission Allow/Deny on shop and customer forms, map tile loading in Website, Owner live-position start/stop while map open, and Google Maps road directions as external navigation.
5. **Cancellation:** for a *separate real unpaid test order*, cancel while pending, ensure stock restored once and Owner notified. Never cancel existing customer orders without authorisation.
6. **Security/launch:** review Auth leaked-password protection in Supabase Settings, security advisor RPC findings, complete privacy & retention policies, PWA push/email as needed, and order/financial reconciliation. Automatic WhatsApp messaging to +94 75 235 1751 remains **NOT connected** until official Meta WhatsApp Business API is set up; existing WhatsApp links are manual.
7. Do not send real account passwords or API keys in chat. Sign in directly on the site when doing acceptance tests.

## Go/No-Go
**Code + database tests passed; Cloudflare deployed.** **NOT yet fully production-launch verified:** no real photo binary or authenticated browser checkout/owner delivery acceptance test; no new Phase 5 mobile browser rendering due to rate limit. General public launch should follow a complete real-account closed pilot.
