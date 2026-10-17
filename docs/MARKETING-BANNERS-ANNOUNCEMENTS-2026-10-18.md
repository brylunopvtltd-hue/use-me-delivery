# USE ME — October 18, 2026 Offers & Announcements Campaign Release

## Published production
- Site: https://use-me-superapp-web.bryluno-zunora.workers.dev/
- Worker: `use-me-superapp-web`
- Cloudflare Deployment: `a9b9787a-178b-4a17-9a0f-9f1959ac7d87`
- Version: `6965d358-6f8d-4fa3-85fd-bbc66b5a874e` (Cloudflare reports 100% live traffic)
- Supabase project: `woytuayeuyfvucttvosw`
- Campaign management UI: Owner Dashboard → Ads & Offers
- Official announcement management: Owner Dashboard → Announcements

## Live banner images and important media-host repair

Original artwork: six 1672 × 941 PNGs. For production, optimized full-resolution WEBP images (~130–160 KB each) were created.

The initial USE ME SERVICE WordPress media URLs were **not publicly accessible** because that WordPress site is not launched. External validation failed, and a live screenshot showed broken image icons. The broken image links have been replaced with **public media-only uploads to the user-owned, publicly launched ZUNORA WordPress media library**. This is a temporary, cross-project CDN and should be migrated to dedicated USE ME storage when available. No ZUNORA posts or pages were modified.

| Campaign | Public WebP media URL | Visibility |
|---|---|---|
| Marketplace | https://zunora.wordpress.com/wp-content/uploads/2026/10/use-me-marketing-hero.webp | Live |
| Daily Essentials | https://zunora.wordpress.com/wp-content/uploads/2026/10/use-me-daily-essentials.webp | Live |
| Delivery | https://zunora.wordpress.com/wp-content/uploads/2026/10/use-me-fast-delivery.webp | Live |
| Refer & Earn | https://zunora.wordpress.com/wp-content/uploads/2026/10/use-me-refer-and-earn.webp | Live |
| Announcements | https://zunora.wordpress.com/wp-content/uploads/2026/10/use-me-new-announcements.webp | Live |
| Special Offers | https://zunora.wordpress.com/wp-content/uploads/2026/10/use-me-special-offers-draft.webp | Draft: **not live** |

### Verified corrective changes

- Supabase external_image_url check restricts links to approved USE ME branded image names hosted at one of two user-owned WordPress domains.
- Gallery JavaScript whitelist now accepts the live working host.
- Gallery CSS override of the HTML hidden attribute was corrected via `.useme-campaign-slide.useme-campaign-fullart[hidden]{display:none!important}`. Previously it rendered all five carousel slides stacked.
- Canva independently fetched the new public media URL successfully.
- Cloudflare Browser Rendering screenshot after the fix showed one correctly displayed USE ME Marketplace image slide and slider controls.
- DOM validation confirmed exactly one visible slide, with its natural image size 390×219 on the mobile screenshot viewport. Other lazy-loaded hidden slides initialize later.

## Website code and DB changes
- `useme_campaigns.external_image_url` with a strict constraint allowing only images from the user's USE ME SERVICE WordPress media uploads folder. Custom owner-supplied Supabase Storage images take precedence.
- Updated `promotion-system/useme-promotions-v1.js`: Full-width image slides for approved WordPress image banners, safe URL check, responsive img srcset, clickable overlay, no duplicated visible text.
- New `promotion-system/useme-marketing-gallery-v2.css`: responsive high-res aspect ratio, slide controls, news cards and reduced-motion support.
- Updated production Owner Announcements renderer to include home and offers. The existing Shop notices moved **after** `#liveProducts` rather than at the top, preserving a product-first shopping experience.
- Added home and offers Official Announcements containers.
- Three new public announcements with truthful messages about real local shopping, parcel delivery requests, and saved products/loyalty coins.
- Preserved all existing Order Management, V7 product layout, V8 Wishlist, Owner Studio, referral systems.

## Important limitations and Owner clarification
- Pre-existing Owner-created announcement, 'Welcome to US ME families — all first orders 80% off', is STILL active; this release did not invent or edit it. Terms, availability, checkout enforcement, and funding of that 80% promotion have not been verified; Owner must review it in Owner Dashboard → Announcements.
- No flash sale, price-cut badge, stock scarcity, or collectable voucher was published without legitimate offer terms.
- Full logged-in owner end-to-end tests were not done.
- Cloudflare Browser Rendering subsequent tests hit error 2001 (rate limit). Source read-back and deployment allocation were verified; on-device image/network loading and announcement presentation still merit visual inspection.

## Implementation notes
The production Worker bundle (HTML/CSS/JS) is currently separate from the older GitHub root index.html. Do not deploy the outdated root in place of this Worker. Database migrations and the code files document the release.
