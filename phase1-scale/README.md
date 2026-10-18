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
