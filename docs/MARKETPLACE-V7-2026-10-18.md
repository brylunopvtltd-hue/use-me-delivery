# USE ME Marketplace V7 — Product-first shop redesign

Date: 18 October 2026

## Live deployment

- Live website: https://use-me-superapp-web.bryluno-zunora.workers.dev/shop
- Cloudflare Worker: `use-me-superapp-web`
- Deployment ID: `d8bb51cf-4d9d-470e-934c-135b39aeb1d9`
- Version: `1790aa77-6f12-4d42-bff7-942b7a583cf4`
- Cloudflare reports 100% traffic on new deployment.
- Cloudflare worker source was read back and expected structures and asset references verified.

## Changes made directly to the live Cloudflare Worker

1. Shop page reordered to **search → horizontal category filters → actual approved merchant product grid**, then shop department art and promotional banners lower on the page. This removes the former excessively long scroll to reach real products.
2. Compact blue USE ME marketplace header with prominent Cart shortcut.
3. Mobile storefront: two-column product grid; tablet up to three, desktop four or five as available. Product photographs presented fully with `object-fit:contain` rather than cropping and consistent cards.
4. Merchant badge and name, actual backend-listed price, stock badge and Add to Cart displayed clearly. No invented discounts, review scores or free delivery claims.
5. Category chips include All, Groceries, Food, Fashion, Beauty, Electronics, Home, Health, Baby, Books, Sports, Pets and Automotive. They keep the current URL and server filtering semantics. Removed visible empty placeholder category cards.
6. In-stock products listed before unavailable ones, preserving the existing price sort within groups.
7. Search field now reveals products at the top with a visible live result count.
8. Added new stylesheet `/assets/useme-store-v7.css`, updated core script cache version, advanced PWA service worker cache.
9. Previous QA improvements (empty-cart LKR 0 display, direct parcel labels, owner shortcut, notification filters) and owner order management remain in the source.

## Caveats

- This commit only records the production change. The complete Worker source is *not* in this repository's outdated root index.html. Do not replace the live Worker with the outdated repository root.
- JavaScript runtime behavior and mobile visual rendering have **not** yet been independently browser-tested after this update; Cloudflare code readback, expected DOM ordering, asset references and 100% deployment allocation were verified.
- Real products continue to be loaded from Supabase according to approved shop / active product rules; no product rows or old orders were modified.
- Background push/email and automatic WhatsApp messaging remain open operational items.
