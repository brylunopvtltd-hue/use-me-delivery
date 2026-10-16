# USE ME — Owner-managed shop pickup / buy-and-deliver operations

## Business rule
- Shops register and provide a **private physical pickup location and contact number**.
- Shop partners upload product photos, product names/descriptions, price, and available website stock. They may edit listings and their own shop pickup details.
- Customers order through USE ME, **not from the merchant directly**. No online payment is taken and checkout is a pending request.
- **Only USE ME platform Owner** may see and manage every customer order, customer contact/address, order items, final quote, order status, and delivery.
- USE ME Owner visits the listed shop, buys the selected items, and personally delivers to the customer. Product sale availability must still be confirmed.
- Seller must **not** receive customer orders or customer phone/address, and must **not** accept/cancel/update delivery status.

## Implemented production changes
- Owner-only RLS policies for public.orders, public.order_items, public.order_status_events.
- Owner-only authorization in public.set_order_status.
- public.place_marketplace_order sends order notifications to USE ME Owner and customer ONLY; no shop-owner notification.
- public.useme_notify_order_managers sends status notices to USE ME Owner, not shop owners.
- Private public.shop_pickup_details table with RLS (platform owner + owning partner only).
- Atomic authenticated shop registration via public.register_useme_shop (shop name/address/phone/notes).
- Protected partner pickup edit via public.update_useme_shop_pickup; owner may also edit.
- Pending shop cannot be approved without pickup details; products cannot be published nor purchased online without approved shop and pickup record.
- /profile shop registration includes full pickup address/phone.
- /seller lets signed-in partners manage product catalogue and their own shop pickup address, not orders.
- /seller owner dashboard shows partner shop name/address/phone/maps/notes, ordered products and quantities, customer name/phone/delivery address, totals/status and pickup stages.
- Owner "WhatsApp order details" opens a prefilled message composer; customer can optionally open a WhatsApp message after successfully saving an order.
- Owner in-app order notifications remain via Supabase notification table & Realtime when app is open.
- Home page approved reference design remains byte-for-byte unchanged.

## IMPORTANT: WhatsApp status
Automatic WhatsApp delivery is **not configured**. A wa.me link does not send any message until a user opens WhatsApp and presses Send. To send automatic transactional WhatsApp messages to the Owner from the website, the application needs a dedicated WhatsApp Business Platform / Cloud API connection (business account, sender phone number ID, approved message/template where required, secret access token and permission/configuration). Keep the token in server-side secrets, never expose it in browser or GitHub.

## Testing
- Supabase owner-only RLS policy readback and owner-only status RPC guard verified.
- Supabase listing RPC no longer creates shop owner order notifications.
- Full rollback transaction used simulated seller and buyer accounts with real post/approve/list/checkout: seller attempting set_order_status with an actual order ID was denied; owner could see the order, item, pickup details and owner order notice. Rolled back simulated accounts, shops, products and orders.
- Cloudflare Worker at 100% traffic contains new owner-only HTML, JavaScript, and CSS.
- Automated Cloudflare browser screenshot testing hit provider rate limiting; do not treat device QA as passed.
- Existing live customer orders were **not modified or deleted**.

## Remaining before launch
1. Owner/seller login and genuine product photo upload testing on physical Android handset.
2. Existing approved shop needs its physical pickup location/contact filled in under /seller (older listing pre-dated this requirement).
3. Customer real order test from published product, owner purchase, final quote, delivery and customer receipt.
4. Secure WhatsApp Cloud API integration for fully automatic notification delivery; phone number and API setup must be confirmed.
5. Optional background PWA push and email alerts require separate server-side configuration.
