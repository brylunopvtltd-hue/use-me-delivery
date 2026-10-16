# USE ME V3: consent-based shop, customer and owner map integration
Date: 2026-10-17 (Sri Lanka). Homepage design remains unchanged.

## Purpose
Customer explicitly chooses to share their current GPS coordinates for a delivery order; shop owner explicitly chooses to share the shop pickup coordinates. USE ME Owner alone sees both GPS pins alongside private order details.

## Location privacy
- Never request geolocation on page load. Buttons use `navigator.geolocation.getCurrentPosition` when clicked.
- All location sharing is optional. Users can type the address without sharing GPS.
- Browser controls whether permission is once-only or retained; the Website cannot force a once-only browser permission.
- The customer/shop location is a **one-time coordinate snapshot**, not continuous tracking. The stored snapshot can be updated or deleted using the app.
- Customer coordinates are stored in `public.orders` and can only be read by the owning customer and USE ME Owner due to RLS.
- Shop GPS is stored in `public.shop_pickup_details` and can only be read by the shop account or USE ME Owner due to RLS.
- Updates use authenticated SECURITY DEFINER RPCs with owner-of-order/shop checks, range validation and non-closed-order constraints. No public/anonymous EXECUTE grants.
- Form GPS drafts live in browser memory only, not localStorage; they are uploaded only on successful shop save/registration or order submission.
- Owner may explicitly opt into `watchPosition` while the private map dialog is open; coordinates remain in the current page only. Closing the map or navigating away calls `clearWatch`.
- No customer or shop owner continuous location tracking, and no server-side collection of the Owner's live route.
- Before launch, publish explicit privacy/retention guidance for completed order GPS and get stakeholder consent.

## Implemented pages and controls
- `/profile` shop application: optional shop GPS capture, mini-map preview, coordinate stored after successful registration.
- `/seller` shop pickup editor: one-tap optional GPS, map preview, save/clear GPS, saved status, typed address still mandatory.
- `/cart`: optional customer GPS selection, preview, save with new order and real shop cart checkout.
- `/order/new`: optional GPS selection, save with new service order.
- `/orders`: share/update/remove own order GPS while active; remove saved coordinates even for a closed order.
- `/seller` owner order card: private shop/customer GPS badges and full in-website OpenStreetMap (Leaflet) map with both pins.
- Map shows approximate dotted geographic line, explicitly **NOT a road route**. Road navigation buttons open Google Maps separately for Shop or Customer; if both GPS coordinates exist, Google Maps Shop→Customer driving directions are available.
- Owner can view their live position only while that map remains open after opting in.

## Production verification
- Supabase migration applied: `useme_opt_in_shop_and_delivery_gps_snapshots`.
- Anonymous RPC execution disabled for all four coordinate-update/clear functions.
- Rollback-only tests: customer order GPS saved and cleared; shop coordinates saved/cleared by platform owner; unrelated authenticated user was blocked from changing another customer's GPS.
- GitHub source code syntax checked for index inline JS, phase4.js and new locations.js.
- Cloudflare Worker `use-me-superapp-web` deployed with GPS assets and 100% traffic; existing approved Homepage HTML byte-identical to approved reference.
- Mobile browser verified `/cart` active, GPS button displayed and location script loaded; additional browser-rendering screenshots were rate limited.
- Browser geolocation accuracy/permissions and Leaflet tile loading on a real Android phone still need hands-on testing.
- As of initial audit, one older shop was `suspended` and had no pickup details. During subsequent live use, a second shop appeared with `pending` status and a saved private GPS pickup pin. An authorized USE ME Owner must review its details and approve; do not change statuses automatically.
- SQL tests rolled back location changes and did not create permanent GPS records. New real shop data may appear as users exercise the released registration flow. No customer GPS location was manually created by the assistant.

## WhatsApp
Confirmed USE ME owner number: `+94 75 235 1751`.
- Pre-filled WhatsApp order message, initiated by customer/owner, remains functional.
- Automatic WhatsApp Cloud API sends cannot start without Meta approved phone number ID, access token, and approved templates where required. Existing Cloudflare Worker secret names do not include a WhatsApp or Meta token.
- Never insert Meta credentials into GitHub, browser source, a message link, or this QA document.

## Post-deployment confirmation
- Live Worker verified as 12 assets, new locations.js present, latest deployment using 100% traffic.
- Mobile browser verified /cart location UI and active route. Additional screenshots encountered Cloudflare browser-rendering rate limits.
- Strict DB check constraints require all four fields or all NULL for a GPS point; migration applied.
- Android GPS permission, map tile loading and turn-by-turn road directions should still be tested by the Owner. Google Maps handles road navigation on an explicit click, while the embedded map shows pins and an approximate (non-road) connector.
