# USE ME — Promotions Studio V1
Date: 18 October 2026

## Production
- Website: https://use-me-superapp-web.bryluno-zunora.workers.dev/
- Cloudflare Worker: `use-me-superapp-web`
- Deployment ID: `ab9d3d74-dc83-496e-b541-720ce546c5ee`
- Cloudflare version: `307044ef-4f56-420a-b200-e36423a1f6d5` (reported 100% deployed)
- Supabase: `woytuayeuyfvucttvosw`
- Source assets: `promotion-system/useme-promotions-v1.js`, `promotion-system/useme-promotions-v1.css`.
- The repository root `index.html` is **not** a copy of this production Worker and must not replace the current deployment.

## Implemented storefront
- Homepage search → actual Shop listings, trust band, safe ticker, 3-slide rotating/swipeable banner carousel (previous/next/dots, accessibility), and 8 service/category shortcuts.
- Dynamic Collections, real recently listed available items at their actual prices, Product Quick View and Add to Cart.
- Product-first Shop preserved: all shop campaign elements **follow** the live product grid.
- Promotions components on Home, Shop, and Offers (banner/ad, ticker, flash products, coupons, collections).
- Owner-controlled flash sale countdowns (real scheduled end date; linked to approved actual product price & stock). Inactive until the Owner publishes a qualifying campaign.
- Owner-controlled advertising and optional one-time campaign popups; explicitly label ad sponsor.
- Coupon campaign display, claim/reclaim protection, minimum order and global claim limit controls, Collect All. **Discount is not automatically deducted from checkout.** Owner confirms eligibility and any final savings separately.
- Reduced-motion-aware animations, responsive cards, images and mobile UI. No fake visitor count, rating, price cut, or stock scarcity.

## Private Owner Studio
- Owner Dashboard → 🎟️ Ads & Offers tab.
- Create/edit/pause/delete Banner, Sponsored Ad, Ticker, Flash, Coupon, Collection, Popup campaigns.
- Schedule start and end; active switch; order priority; page placement (home/shop/offers); animation toggle.
- Upload genuine owner banner images under 5 MB to `useme-campaign-images` Storage bucket; stores path in campaign row.
- Choose actual approved product for flash cards. Validated safe internal CTA links.
- Campaign preview and status list.
- Database RLS permits public reading only of active current campaigns; owner sees drafts and scheduled rows. Only owner may write campaigns or upload images. Coupon claims use an authenticated, row-locked security-definer RPC with claimant/availability/cap checks.

## Database migration
- `useme_campaigns_owner_ads_coupons_v1`: tables `public.useme_campaigns`, `public.useme_coupon_claims`; RPC `public.useme_claim_coupon`; Storage bucket and policies.
- `useme_campaign_public_view_without_privileged_owner_function`: narrowed anonymous SELECT predicate to avoid invoking owner-only function, after an actual public browser test surfaced a permissions failure.

## Verified
- Cloudflare Worker update accepted with HTTP 200 and deployed 100% of the active version.
- Worker read-back confirms Home / Shop / Offers / Owner markup and JS+CSS assets. Original Owner Order Command Center was retained.
- Browser-rendered live homepage test showed **three banner slides, ticker, eight shortcuts, collection cards** after Supabase policy fix.
- Database shows three active genuine informational banners, two tickers, and two collections. No artificial sale, sponsorship, or coupon has been invented.
- Full authenticated Owner Studio walkthrough, image upload, voucher claim and mobile tap-through are **not yet independently verified**. A subsequent Browser Rendering attempt for Shop/Offers hit a Cloudflare rate limit; static markup ordering was verified.

## Still requires Owner input or separate backend infrastructure
- Create actual flash sale product campaigns / voucher amounts / signed sponsor ads in the Owner Console.
- Automatic final checkout discount enforcement (not enabled; quotes remain owner-confirmed).
- Automatic Meta WhatsApp Business API, background Web Push and email delivery remain separate from marketing/onsite promotions.
- Manual owner-account regression test and responsive device testing recommended.
- Production Worker source-of-truth consolidation in GitHub remains a future project.
