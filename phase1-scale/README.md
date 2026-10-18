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
