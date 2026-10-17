# USE ME V8 — NEW Capabilities Rollout
Date: 18 October 2026

## Why this project
The user confirmed that the existing Homepage Carousel, Promotions, Categories, Shop Product Grid, Order Tracking, Shop/Seller screens and Owner Control were already built. V8 must **not** rebrand those as new features. This deployment specifically delivers substantial **new functional modules** on top of them.

## Current production
- URL: https://use-me-superapp-web.bryluno-zunora.workers.dev/
- Worker: use-me-superapp-web
- Cloudflare deployment ID: `537ab9ca-0fda-4ddf-9a68-1faf573d1333`, reported 100% traffic
- Supabase project: woytuayeuyfvucttvosw
- Frontend source: [v8/useme-v8-new-features.js](../v8/useme-v8-new-features.js), [v8/useme-v8-new-features.css](../v8/useme-v8-new-features.css). Production worker assets include these but the repository root index.html remains an OUTDATED site source; don't redeploy it over the Worker.
- In this rollout, no historical customer order status or finance record was edited.

## Delivered NEW core functionality (V8 foundation)
1. **Shopping:** Signed-in Wishlist / remove saved items, real Saved Page, recently viewed products, preference-aware actual-product recommendations, seller price reduction alert trigger, mobile ♥ on shop cards.
2. **Rewards & Referrals:** Customer reward wallet, 10-character referral code, register a code before first order, coin credit on qualifying delivered orders and qualifying referrals, private coin history, owner switches. Coins are **NOT money**; there is NO automatic coupon/cash redemption. Bonus earns only on qualifying first delivered order. Owner cannot be bypassed to award delivery status.
3. **Delivery:** Customer generates optional per-order 6-digit delivery code (accepted orders only, one-hour expiry), Owner verifies it; five failed attempts lock OTP until new issuance. OTP hashes are private, verification does NOT autonomously mark order Delivered. Existing Maps/GPS/Order Status unchanged. This is NOT customer-visible streaming owner GPS, proof photos or automatic route optimization.
4. **Seller Inventory:** Shop-local low-stock alerts and CSV export of own products, without private customer order data or owner Order permissions.
5. **Owner Controls:** Private Business Finance section for confirmed cash receipts, expense categorization and reward switches, private B2B review, OTP verification. Existing advanced Owner RBAC/Order Dashboard retained.
6. **B2B & Money:** Real database-backed B2B buyer RFQ, private owner review, quote/status, owner and buyer notifications. Actual cash received vs recorded expenses vs delivered quoted order totals shown separately; reported difference is NOT certified profit.

## DB migrations applied
- `useme_v8_real_saved_rewards_referral_b2b_costs`
- `useme_v8_delivery_pin_and_saved_price_alerts`
- `useme_v8_otp_attempt_lockout_persists`
- `useme_v8_owner_confirmed_cash_and_b2b_status_notifications`
- `useme_v8_real_b2b_owner_notifications`
- `useme_v8_loyalty_direct_write_privilege_hardening` (direct UPDATE/INSERT on wallet/coins revoked from authenticated clients; only guarded database functions can award coins)

Primary RLS: private Wishlist, recent items, wallets, coin ledger, B2B buyer/owner data, Owner-only finance; unprivileged direct OTP table access revoked. Owner-only requests/commands via auth checks. Seller cannot read other customer orders under pre-existing orders policies.

## Verified
- Supabase migrations succeeded and trigger definitions present.
- Cloudflare deployment returned HTTP 200 and read-back verified all V8 module IDs with old Owner/Shop/Promotion assets preserved.
- Browser-rendered public homepage returns 3 real carousel slides, V8 guest auth boundaries.
- Browser-rendered public Shop returns **8 actual published cards with 8 heart buttons**; product grid remains above campaign banners.

## NOT independently verified with logged-in test account
- Actual saving/removing wishlist in Supabase and cross-device persistence
- Referral registration and reward award after first delivery
- OTP issue/verify workflow, five-attempt lockout and expiry
- Seller private inventory CSV download
- Owner finance receipt/expense inserts
- Real B2B submission/owner review notifications

## Remaining feature roadmap from the requested full 1–6 vision
- Automated verified coupon/redemption pipeline and detailed policy
- Daily Check-in rewards, Spin & Win only after reward economics / abuse rules; not implemented or advertised live
- Real-time customer-visible owner GPS with deliberate opt-in and clear retention rules
- Multi-drop automated routing and scheduling
- Product variants, multiple images, customer questions, authentic reviews
- B2B supplier matching, negotiated purchasing/contracts, subscriptions/commissions
- PWA Push/Email/automatic WhatsApp delivery and end-to-end permissions QA
- Full financial reconciliation and profit calculation after complete expense/cash data

These require incremental verified implementation. Do not assert the entire 1–6 long-term vision is 100% complete.
