# USE ME V3 — Phase 4 owner operations & launch QA
Date of changes: 2026-10-17. Production project: woytuayeuyfvucttvosw.

## Production implementation
- `/seller`: authenticated Owner/Seller dashboard, order summaries, search, status filters, quote confirmation for Owner only, detailed order items, timeline and shop approval management.
- `/orders`: customer orders are explicitly filtered by `customer_id = auth.uid()` in addition to database RLS. Displays estimated versus Owner-confirmed amounts, timeline, product details, and pending-order cancellation.
- `/notifications`: user-scoped Supabase notifications, mark one / mark recent read, notification shortcuts, Realtime INSERT subscription with 30-second polling fallback while page is visible. Email and background push are NOT implemented.
- `/send`: existing local draft feature remains explicit, with a distinct button to submit a real authenticated service request through `/order/new?service=parcel`.
- Server requires Owner-confirmed final item/service fee + delivery quote before changing order status from `pending` to `accepted`.
- `confirm_order_quote` checks `is_owner()` server-side; shop product totals cannot be overridden by the Owner. No online payment is taken.
- `cancel_my_pending_order` checks authenticated customer ownership and pending state, restores marketplace stock once, logs transition, and writes notices.
- Shop registration / approvals and order status changes now generate in-app database notices via SECURITY DEFINER triggers.
- Fixed Supabase Storage RLS: the nested image policy now checks `storage.foldername(storage.objects.name)`, NOT accidentally `storage.foldername(shops.name)`.
- Restricted direct browser grants on `notifications`: authenticated SELECT and UPDATE(`read_at`) only. Notification creation by trusted server functions / triggers.
- Notifications table added to `supabase_realtime` publication (Postgres Changes subscription still requires supported clients/auth).

## Successfully verified in rollback-only database transactions
1. Approved shop owner simulated authenticated role could INSERT and SELECT an authorized `product-images` object metadata row (transaction rolled back). Actual binary photo upload remains to test through seller account.
2. Service order 22 km with Owner quote: item total LKR 100, delivery LKR 750, status `accepted`, final quote timestamp set; 4 associated notices, all rolled back.
3. Attempt to accept order without Owner quote: rejected.
4. Non-owner attempt to confirm Owner quote: rejected.
5. Customer cancellation of pending marketplace order: stock returned from 3 to 5, one status event. Repeated cancellation: rejected.
6. Mark notification read RPC succeeds for the notification recipient under restricted column-level database grants; test data rolled back.

## Live Cloudflare checks
- Worker `use-me-superapp-web` 100% rollout, embedded 11 assets including `/assets/useme-phase4.js` and `/assets/useme-phase4.css`.
- `.css` files now served `text/css`, not `text/html` with nosniff.
- Guest mobile browser can open `/seller`, `/orders`, `/notifications`; correct screens active, new Phase 4 controls rendered.
- Guest Seller management/Owner controls remain hidden. Reference Homepage section was not modified.

## Manual acceptance tests before public launch
- Log into existing Owner account, verify Owner dashboard shows approved shop and quote form. Use a real approved shop Seller login to upload a genuine product photo and publish it.
- Place a real customer test order; verify in Owner Dashboard, confirm quote, accept, update status, observe buyer and seller notification visibility.
- Cancel a pending order as customer; verify database stock restoration and owner notice.
- Inspect Order and Notification pages on Android/PWA (mobile and desktop, refresh/back, slow internet).
- Configure leaked-password protection in Supabase Auth, assess remaining authenticated SECURITY DEFINER advisor notices, and consider email/PWA push separately.
- Note: all production counts had no live products or customer orders before this Phase 4 rollout. Do not invent a successful external checkout or payment.
