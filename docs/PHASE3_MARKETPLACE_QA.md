# USE ME V3 — Phase 3 production QA

This file documents the rollout verification and seller-side tests. **Never place real user passwords or private customer data in a test report.**

## Verified from database and public website (2026-10-17)
- `shops`, `products`, `profiles`, and checkout functions existed before the Phase 3 change.
- Existing approved shop count: 1; live product count before merchant upload: 0. No demo products should be published.
- Public guest database role can SELECT an approved shop, but cannot SELECT its owner_id.
- Storage bucket `product-images` is public-read, image-only (JPEG/PNG/WebP), capped at 12 MiB per photo.
- Storage INSERT/SELECT/DELETE policies are restricted to approved shop owners and USE ME owner role.
- Product columns `category`, `description`, `image_path` created; publishing requires an image_path in its own shop folder.
- Anonymous execution of `set_shop_approval` was revoked, and server function checks owner role.
- `/shop` renders verified merchant empty state when there are no products, not fake listings.
- `/profile` loads the guest login/registration UI while keeping seller management hidden.
- Homepage reference HTML was not altered.

## Security and rollback-transaction results (2026-10-17)
The checks below used temporary rows and simulated database role claims **inside ROLLBACK transactions**. No real customer orders, photo objects, or notifications were committed.

- Verified public guest can list the 1 approved shop but not execute `is_owner`, `owns_shop`, `my_useme_role` or `create_customer_profile` helper RPCs.
- Guest's approved-product RLS policy no longer relies on privileged owner helpers; a temporary published product remained visible in a rollback test.
- Non-owner identity was denied access to `set_shop_approval`; admin checks remain server-side.
- Checkout test: item unit price LKR 320 x 2 = LKR 640, 22-km delivery LKR 750, test stock 5 → 3, pending status and 3 database notifications.
- Insufficient-stock test: request 2 units when only 1 exists was rejected; stock stayed 1, no order or notification persisted.
- Cancellation test: a mock order was cancelled, stock automatically restored from 3 to 5, and one order status event recorded.
- Repeat-cancellation test: second cancellation was blocked, status-transition count stayed 1, and stock remained 3 rather than doubling.
- `my_useme_role()` now grants the seller dashboard role to any user who owns an approved shop, even if their underlying customer profile remains `customer`. Tested by temporarily setting an existing profile to customer then rolling back.
- `/seller` is a dedicated mobile route to product management and authorized order/approval panels. A guest browser confirmed the sign-in notice while the privileged panels remain hidden.
- The approved reference Homepage markup was preserved across this update.
- Supabase security advisor now lists no **anonymous** SECURITY DEFINER execution warnings. Authenticated helper/RPC warnings remain by design, with server-side identity checks; leaked-password protection remains a configurable Auth warning.

## Seller acceptance test (requires real approved seller login)
1. Sign in at `/profile`, then visit `/seller`. Confirm only approved owned shops appear in Seller Product Studio.
2. Choose a genuine JPEG/PNG/WebP image below 12 MB. Check preview.
3. Save product; verify unpublished status and uploaded image URL.
4. Set stock and click Publish; verify visible on `/shop` in guest/private browser.
5. Search name, filter category, sort price, add to cart; confirm correct image and price.
6. Update price or stock as seller; open guest cart and verify it refreshes or removes unavailable items.
7. Replace photo and verify new image is displayed; check old image cleanup.
8. Confirm a pending/unapproved shop cannot upload to the approved merchant bucket or publish.
9. Verify shop-owner users cannot approve their own shop; only USE ME owner can approve through the dashboard.

## Checkout acceptance test (requires signed-in buyer)
1. Add real in-stock product to one-shop cart; change quantity, remove, clear cart.
2. Submit a legitimate test order from `/cart`.
3. Confirm server RPC recalculates price and protects stock; status should be pending confirmation, not paid.
4. Test insufficient stock or disabled product: server must reject order.
5. Check buyer / owner notification list and correct shop authorization.
6. Confirm no online payment has occurred, and owner must confirm final fees.

## Follow-ups
- Actual authenticated photo upload and paid/order workflow were **not** impersonated or claimed tested during automated deployment because no seller and buyer credentials were supplied.
- Supabase Auth leaked password protection is not enabled; this requires a project Auth setting. Authenticated SECURITY DEFINER warnings must be evaluated individually, not blindly revoked because some RPCs and RLS checks need them.
- Improve pagination, multiple product photos, image moderation, seller analytics and notifications before general marketplace launch.
