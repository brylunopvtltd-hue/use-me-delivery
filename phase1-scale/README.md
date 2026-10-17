# USE ME — Free Product Scaling Phase 1 (Preview)

This branch records the two client-side assets uploaded to the separate Cloudflare Worker `useme-scale-phase1-preview`. It does **not** change the live Worker `use-me-superapp-web`.

## Changes staged
- Seller product list now queries the **selected shop** with Supabase `.range(...)`, fetching 40 at a time and providing a Load More control. Previous code loaded only the first 120 products across all shops.
- Approved shop product-detail pages now paginate active products, 40 per request, rather than displaying at most 120.
- Marketplace product grid now fetches 40 product rows per page, with a Load More control. Original code stopped at the first 120 products.
- Product photo upload now attempts client-side WebP conversion/resize (maximum dimension 1600 pixels, quality 0.80), uploading the smaller image if optimization succeeds, otherwise preserving the existing JPEG/PNG/WebP upload path.

## Scope & safeguards
- All product and order records remain in the existing Supabase project.
- No existing records were deleted or altered.
- No R2 bucket or paid subscription was created.
- The main production Worker was **not modified**.
- Existing owner-only order management and seller product permissions were not changed.
- This draft is for review; the files are copies of staged Worker assets and are **not automatically wired to deploy** through this GitHub repo.

## Required verification before production
1. Run `node --check` on both JavaScript assets in a local Node environment.
2. Manually test a seller with 300+ products; confirm navigating between shops while a page is loading.
3. Manually test an approved public shop page with 300+ products, including page boundaries.
4. Manually test marketplace filters, search, price sorting and Add to Cart with 300+ products.
5. Test JPEG/PNG/WebP uploads on Android browsers, transparent PNG files, and the 12 MB validation cap.
6. Verify owner dashboard, checkout, orders, stock, and permissions.
7. Improve the separate V9 catalog search (currently capped at 400 products) before declaring large-catalog readiness.
8. Review Supabase usage/billing thresholds; no free plan can guarantee unlimited traffic.

## Known limitations
- This is a **staged code-level implementation**, not a proven 10,000-product load test.
- The V9 search catalog still has a 400-item fetch cap.
- Shop selector and approval listing remain subject to their own query caps.
- Automatic resizing is best-effort and may fall back to the original photo.
