# USE ME — Free Product Scaling Phase 1 (staging)

The source snapshots here match the Cloudflare Worker `useme-scale-phase1-preview`, a separate staging Worker. **Live production `use-me-superapp-web` remains unchanged.**

## Changes staged

- Seller Dashboard now loads products for the selected shop **40 per request**, with a "Load more products" button, instead of a global 120-product limit.
- Public approved Shop pages now fetch the selected shop's published products **40 per request**, also with "Load more products".
- Main Marketplace listing now supports **40-product server-side pagination**, with category and price ordering applied by the database, instead of stopping at 120.
- V9 advanced Search no longer fetches a fixed 400-product catalogue. It uses server-side **name, description, category and approved-shop-name text filters**, maximum price and sort, and paginated result loading. Search results count is requested from the database.
- Product photo uploads try WebP resize/compression in the browser (max 1600px, WebP quality 0.80); if optimization cannot produce a smaller valid photo, upload falls back to the original JPEG, PNG or WebP subject to the existing 12 MB validation.

## Code verification

GitHub Actions workflow `.github/workflows/useme-scale-check.yml` ran successfully in run [39081000573](https://github.com/brylunopvtltd-hue/use-me-delivery/actions/runs/39081000573), covering `node --check` on both JS assets and basic staged-feature assertions. A second successful run [39081281972](https://github.com/brylunopvtltd-hue/use-me-delivery/actions/runs/39081281972) verifies the full JavaScript syntax and **five simulated product-catalog tests**, including 350 approved products paginated in nine batches, 70 product-name matches, 25 shop-name matches, category/price filtering, and image-optimizer fallback. These are mock-data tests, **not real browser QA or a proof of 10,000-product capacity**.

## Important limitations before production

- Shop enumeration in V9 Search currently uses only the first **180 approved shops**. Search by shop name additionally evaluates up to 60 matching shop IDs.
- Search category options start with common named categories and expand from loaded pages; this is **not a complete dynamic category facet** for large catalogues.
- Load More queries use offset paging, so changes during browsing may alter page boundaries.
- Server-side price sorting works for the staged Search and Marketplace, but needs browser regression testing.
- The previously existing per-item 12 MB source-photo limit and the project's real monthly storage/bandwidth quotas remain.
- Automatic WebP creation depends on browser support; fallbacks retain original file sizes.
- The GitHub files are staged copies; GitHub merging alone does **not** deploy to Cloudflare.
- Test against a seeded staging dataset of 300, 1,000 and 5,000 products and multiple sellers before a live release.
- Verify mobile image upload, search, cart, checkout, permission boundaries and owner-managed orders before release.
- No R2 setup, paid plan, database records changes, or production deployment were performed in Phase 1.

## Rollout safety

Do not merge or deploy without sign-off after browser and data-load QA. Preserve an exact backup of the production Worker before replacing it.

## Temporary 1000-product QA batch (2026-10-18)

- Production USE ME Supabase project: `woytuayeuyfvucttvosw`.
- Isolated test shop UUID: `8a8d46f2-76bb-4e18-9f1e-e4c6aca171fb`.
- Batch marker in descriptions and shop name: `USEME_QA_1000_20261018`.
- Exactly 1000 products inserted, all with `active=false`, `stock=0`, `image_path=null`, and a pending test shop. Original nine product records unchanged.
- Private owner QA route on the **production Worker**: `/owner/test-catalog`. This page is isolated; the main product, cart and order code was not changed for this release. Only three HTML route aliases, one new JS asset, and service worker navigation cache protection were added to the current production Worker. Prior full Worker backed up to `useme-pre-1000-test-backup-20261018`.
- External internet placeholder photos: `picsum.photos/seed/useme-qa-<test-index>/400/400`, category-based Unsplash backup; no product images were uploaded to Supabase Storage.
- Cleanup when the owner explicitly asks to delete the test batch: inspect foreign key dependencies, then delete **only products with the exact above test shop UUID**, and finally delete **only that test shop**. Avoid deleting original shops, real products, user accounts or orders. Remove the private QA route if requested. Check dependent records before deletion; do not run clean-up automatically.
- Verification: database checks showed 1000 unique test records and 40 records each in first and last logical pagination windows. GitHub Actions syntax check passed; actual client login and third-party image CDN browser rendering still require hands-on confirmation.

## Real source-linked catalogue deployed (2026-10-18)

- Live public URL: `https://use-me-superapp-web.bryluno-zunora.workers.dev/real-products`.
- Public Supabase reference table: `public.useme_reference_products` with exactly **1,000** factual source-linked product records, **995** external photo URLs, **895** distinct brand labels.
- This is intentionally **separate from** `public.products` and **not orderable**. No local price, local stock, or seller attribution was invented. It contains source snapshots, not verified local inventory.
- Source: `https://github.com/luminati-io/Amazon-dataset-samples`, sample of real Amazon listings with titles, brand labels, ASINs, source retailer URLs and photo URLs. Rights to retailer images remain with the respective owners; not guaranteed to hotlink successfully. Not endorsed by Amazon.
- Access: RLS enabled; `anon` and `authenticated` get `SELECT` only. No client insert/update/delete grants. Import was performed using the authenticated Supabase administration connector.
- Website: new `/real-products` HTML, `/assets/useme-real-catalog.js`, main home-page discovery link, service-worker cache guard. Frontend retrieves two database batches of 500, renders 40 cards at a time, with full-catalog search, category and name sorting, origin links. No Add to Cart or checkout buttons.
- Before real-page production update, complete live Worker backup: `useme-backup-before-real-products-20261018`. Verified 100%-active deployment. Existing owner test route, live sales UI, maps and order assets left unchanged.
- The earlier `public.products` QA batch of 1,000 nonactive, stock-zero drafts in shop `8a8d46f2-76bb-4e18-9f1e-e4c6aca171fb` still exists separately; nine preexisting records are unchanged.
- Future cleanup should distinguish the **older 1,000 QA drafts** from the **new 1,000 real reference entries**. Do not delete either group without confirming which batch is intended. This real reference table is not sellable USE ME product inventory.
- Cloudflare source/assets and SQL row counts were checked. Actual customer-browser render and image CDN success remain to be manually checked.


## LIVE — Standard USE ME Shop now supports requesting 1,000 actual external products (2026-10-18)

- URL: `https://use-me-superapp-web.bryluno-zunora.workers.dev/shop`, inside the EXISTING `#buy` page.
- Added source files: `phase1-scale/useme-sourcing-catalog.{html,css,js}`. Production Worker contains new `/assets/useme-sourcing-catalog.js` and `/assets/useme-sourcing-catalog.css` and one embedded Shop section. All 47 existing static assets other than index.html were preserved.
- Production Worker rollback source: `useme-before-sourcing-shop-20261018`; deployment API confirms 100%.
- Data uses all 1,000 `public.useme_reference_products` via two 500-record queries. These are real externally sourced product titles, brands, ASIN IDs and image URLs; **not proof of local supplier stock or prices**.
- Customer can search, filter, add to request cart, change quantity (1–10), and place an authenticated on-demand sourcing order for up to 12 different products with name, phone, address, note.
- Migration `useme_catalog_sourcing_order_flow_20261018`: new authenticated-only `place_useme_catalog_order_once` stored procedure; creates a standard USE ME `orders` row with `shop_id=NULL`, `status=pending`, `items_subtotal_lkr=0` (unknown), the configured minimum delivery fee as nonfinal placeholder; child `order_items` preserve product names/ASIN/qty with zero provisional item costs; owner/customer notifications; request-ID idempotency. Existing `confirm_order_quote` supports Owner final product and delivery quote since shop_id is null. No supplier assignment or inventory deductions are fabricated.
- Owner WhatsApp sharing is **opt-in from the customer's successful checkout UI**; it does not claim automatic WhatsApp API message delivery.
- SQL test with simulated authenticated context created an order with 2 items, checked status/quote/idempotency and rolled back. Order count remained 6 after test. RPC EXECUTE access confirmed authenticated=true, anon=false. Existing 1,000 test drafts and 9 original sellable-shop records remain untouched.
- Github Actions run 39101296389 checked source JS syntax. UI IDs matched, 0 missing IDs.
- Remaining human QA: Customer login, mobile browser, image hotlink loading, notifications/owner dashboard list and final price quote; real-world supplier availability must be verified before accepting payment.


## Temporary 1000 products in the OWNER's real USE ME Shop (2026-10-18)

- Request: move one thousand source-linked product names into the **same actual shop listings** as Fresh & White cream and Papaya soap, linked to the user-verified USE ME owner account. This is an integration/load test before public launch, not verified Sri Lankan retail inventory.
- Owner account ID verified: `10bce7e8-c6cb-4e56-9c69-4e25073e4ff6`.
- Target shop UUID: `099d8859-51f3-4e2c-bc09-b397819ac29e`, original shop name `Use me`; **five original shop products preserved**.
- Inserted **exactly 1000** additional rows into `public.products` for the owner shop using genuine source-linked titles, broad categories, placeholder LKR **TEST prices**, stock count `20` for simulations, and `[TEST]` title prefix. No local inventory or prices were validated. Marker: `USEME_OWNER_SEED1000_20261018`. All rows tracked by `public.useme_owner_qa_product_registry` linking ASIN to product_id, enabling precise later cleanup.
- Existing separate older 1000-item test-shop batch and the 1000-row reference catalogue are distinct objects; **do not conflate or automatically delete them**.
- Current verified publishing outcome at this writing: **948/1000 owner-seeded products active**, **52 drafts** pending satisfactory image setup. Source image URLs for all records were recorded in `public.products.qa_photo_url`. Of these, 927 initial records use m.media-amazon.com, 68 records use legacy images-na host, 5 had no original product photo. For the first 932 qualifying cases the database permits a tightly scoped test-only external URL; a separate authenticated upload flow published 16 more by storing actual photo files in Supabase Storage. The remainder is still draft.
- `useme_live_products_need_photo` and `useme_check_product_pickup` were updated only for a **specific registry-backed owner TEST batch**. Actual product photos still require storage uploads for non-test shops/products. This test-only exception MUST be reverted before final real-product launch once seed records are removed.
- Main live Worker `use-me-superapp-web` was updated to support `qa_photo_url` rendering in owner/Seller and public core listings, 40-item server pagination, and shop-page pagination. The separate embedded "sourcing cart" HTML section was removed after the user rejected a second catalogue; original marketplace cart and ordering RPCs remain available for published owner test products.
- Cloudflare backup before changing listing code: `useme-owner1000-live-before-scale-20261018`; earlier backups are also noted above.
- **Before real public launch:** remove old 1000 test-shop drafts if requested, remove 1000 owner seed product rows by registry product IDs, remove separate reference catalogue if requested, remove temporary `qa_photo_url` exception and test-only Edge functions/tokens, add actual USE ME owner/store products with verified images/stock/prices, and revalidate delivery quote and payment/checkout.
- Live orders can use simulated product prices and stock at this stage, so mark all products clearly TEST, **do not represent these numbers as verified prices or take payments without verifying actual costs**.
- Temporary Edge helper used `useme-complete-owner-test-photos` with a private DB-held expiring token and fixed owner-shop-only scope. Do not expose its token or leave it enabled after final cleanup.


## Mobile Chrome verified image + catalogue fix (2026-10-18)
- User-reported screenshots showed **120 products** and generic bag icon instead of matching external product photos.
- Root issues: old mobile service-worker assets cached under `use-me-static-v23-dispatch1` and old HTML JS query `v=v9commerce1`; exact marketplace query lacked `{count:'exact'}`, so a later UI filter could only display already loaded count.
- Live Worker backup `useme-pre-mobile-image-pagination-fix-20261018`; production `use-me-superapp-web` now uses SW cache `use-me-static-v24-productimages`, network-first asset fetching with cache fallback, HTML JS `v=20261018-images-paging3`, correct `{count:'exact'}` in marketplace query. Initial page loads 40 items, next 40 via **Load next 40 products ↓**, total catalog count displayed.
- Exact image helper prefers uploaded matching product photos from Supabase Storage, then the allowlisted Amazon original photo URL; tries canonical unresized Amazon path only on failure. Unavailable photo says **Original photo unavailable**; no unrelated shopping bag or generic photo misrepresented as the product.
- 68 legacy `images-na.ssl-images-amazon.com` test photo references normalized to Amazon's equivalent `m.media-amazon.com` image host, checked on representative samples returning HTTP 200 with same object bytes. The previously remaining 52 owner test drafts were published, confirmed **1000 active of 1000**. Exactly **995/1000 test products** have an Amazon original photo URL; the other 5 have no corresponding original photo, and are not claimed to have one.
- Actual live mobile Chrome Playwright test, GitHub Actions run [39105843594](https://github.com/brylunopvtltd-hue/use-me-delivery/actions/runs/39105843594): **40 of 1008 products** on first load, **80 of 1008** after next page, product card sample images loaded with nonzero naturalWidth (including BOSCH, Elmer's, Greenlee and Cutter & Buck original Amazon photos). Core syntax checks passed.
- Temporary image import Edge Functions `useme-complete-owner-test-photos` and `useme-owner-photo-import-qa` re-deployed as **disabled HTTP 410** endpoints, verify_jwt=true.
- Note: **source-linked TEST data, TEST prices and TEST stock are fabricated for load validation**, not verified local USE ME inventory. External photos may be subject to third-party intellectual-property rights. Cleanup must use `public.useme_owner_qa_product_registry` to isolate the 1000 owner test rows, plus removal of test-only image-path exception and QA-only data when requested.


## USE ME Daraz-style compact responsive Product Grid V10 (2026-10-18)
- User's screenshot showed two large product cards per mobile row and asked for **3/4 per row**, like a compact marketplace.
- Live worker **`use-me-superapp-web`**: added only `/assets/useme-daraz-mobile-grid-v10.css`, `/assets/useme-daraz-mobile-grid-v10.js`, with two corresponding versioned links in the main index HTML. All other prior assets remain unchanged.
- Default for up to 479px viewport: **3 cards per row**. Default for 480–760px: **4 cards per row**. Tap **3/4** density selector to switch (remembers preference locally). Wider screens retain existing desktop layout.
- Compact mobile cards: square full product images, readable two-line title and price, smaller genuine-shop badge, favorite control, smaller Quick View and Add to Cart; hidden duplicative Full Product Details text but photo click/keyboard activation opens existing Quick View. No product/order data changes.
- Live backup: `useme-before-daraz-mobile-grid-v10-20261018`. Cloudflare version deployed 100%.
- Preflight staged CSS/JS Chrome Playwright check: [run 39106819074](https://github.com/brylunopvtltd-hue/use-me-delivery/actions/runs/39106819074), all 360px, 390px and 520px sizes passed; zero JS page errors, no horizontal product-grid overflow, price/cart still visible, 4-column selector works.
- **Live** mobile Chrome regression: [run 39106963586](https://github.com/brylunopvtltd-hue/use-me-delivery/actions/runs/39106963586), HTTP 200 at each size; **360px = 3 columns, 390px = 3 columns, 520px = 4 columns**. Product count `40 of 1008 products`, price/cart visible, no grid overflow, manual 4-column switch works, no page JavaScript errors.
- Future modifications to main live HTML must retain the CSS/JS versioned links; deleting the dynamic source rows/products is independent of this grid styling.
