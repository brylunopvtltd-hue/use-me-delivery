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

## Seller acceptance test (requires real approved seller login)
1. Sign in at `/profile`. Confirm only approved owned shops appear in Seller Product Studio.
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
- Supabase Auth leaked password protection and some pre-existing SECURITY DEFINER advisor warnings remain to review.
- Improve pagination, multiple product photos, image moderation, seller analytics and notifications before general marketplace launch.
