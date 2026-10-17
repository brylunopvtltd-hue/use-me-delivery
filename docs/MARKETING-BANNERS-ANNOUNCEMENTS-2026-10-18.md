# USE ME — October 18, 2026 Offers & Announcements Campaign Release

## Published production
- Site: https://use-me-superapp-web.bryluno-zunora.workers.dev/
- Worker: `use-me-superapp-web`
- Cloudflare Deployment: `a9b9787a-178b-4a17-9a0f-9f1959ac7d87`
- Version: `6965d358-6f8d-4fa3-85fd-bbc66b5a874e` (Cloudflare reports 100% live traffic)
- Supabase project: `woytuayeuyfvucttvosw`
- Campaign management UI: Owner Dashboard → Ads & Offers
- Official announcement management: Owner Dashboard → Announcements

## Original design assets
All six high-resolution original banners (1672 × 941 PNG) were uploaded into the user's USE ME SERVICE WordPress.com Media Library (media IDs 31–36). WordPress is used **only as a public media host**, NOT as the live website or source of truth for campaign content.

| Campaign artwork | Media URL | Live |
|---|---|---|
| Discover & Shop | https://usemeservice.wordpress.com/wp-content/uploads/2026/10/use-me-marketplace-hero.png | Yes |
| Daily Essentials | https://usemeservice.wordpress.com/wp-content/uploads/2026/10/use-me-daily-essentials.png | Yes |
| Fast Delivery | https://usemeservice.wordpress.com/wp-content/uploads/2026/10/use-me-fast-delivery.png | Yes |
| Refer & Earn | https://usemeservice.wordpress.com/wp-content/uploads/2026/10/use-me-refer-and-earn-coins.png | Yes |
| New Announcements | https://usemeservice.wordpress.com/wp-content/uploads/2026/10/use-me-new-announcements.png | Yes |
| Special Offers | https://usemeservice.wordpress.com/wp-content/uploads/2026/10/use-me-special-offers-draft.png | **Draft; not live** |

Campaign placement:
- Homepage image carousel: 5 active informational campaigns (Shop, Delivery, Essentials, Rewards, Announcements), with image light optimization srcset and accessible click targets.
- Shop carousel: after the real-product cards, not above them.
- Offers page: eligible banners, collections, coupons, flashes, official announcements.
- Existing seeded text-only banners paused, not deleted.
- Flash/sale artwork intentionally kept draft pending verified inventory, discount pricing and campaign terms.

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
