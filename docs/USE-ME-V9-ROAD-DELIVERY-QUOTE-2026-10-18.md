# USE ME V9: Automatic GPS Road-KM and Delivery Quote

Date: 2026-10-18

## Production and status
- Cloudflare Worker: `use-me-superapp-web`
- Website: https://use-me-superapp-web.bryluno-zunora.workers.dev/
- Final deployment: `b01bfb83-27de-4eee-b51c-4cadae72b96d`
- Deployed version: `4183452c-4920-4755-b9b6-c1e004e16a54`, 100% traffic
- Supabase project: `woytuayeuyfvucttvosw`
- New Edge Function: `useme-v9-road-quote` (authenticated)
- New frontend modules: `v9/useme-v9-road-fee.js`, `v9/useme-v9-road-fee.css`, server: `v9/supabase/useme-v9-road-quote/index.ts`.
- Existing Lovable development project is **out of credits**, and its V9 map preview had outstanding build issues. These road-pricing changes were installed **directly on the existing Cloudflare Worker**, not in the Lovable preview.

## Pricing policy
- Minimum CUSTOMER DELIVERY CHARGE: LKR 250.
- Historical customer benchmark: Irakkamam–Addalaichenai–Irakkamam total 22 km round trip = LKR 750.
- Internal bike fuel cost was approximately LKR 200 for that reference trip; it is NEVER an extra customer delivery fee.
- Baseline customer estimate: `round(max(min_delivery_lkr, roundtripRoadKm * reference_delivery_lkr / reference_roundtrip_km))`. Rates are read from the real owner settings database, which currently confirms 250 / 22 / 750.
- Surcharge: LKR 0 in automatic preview; owner may confirm an adjustment for difficult roads in final order quote, but customers cannot add arbitrary automatic surcharge through the new server.
- Road distance is obtained via real OSRM **road route** (not Haversine) for Owner → Customer → Owner, including both directional legs. Distances for multi-shop orders are Owner → each verified shop pickup → Customer → Return to Owner. If shop pickup pins are missing, return an explicit manual-quote-needed error instead of undercharging.
- No fabricated KM or price when owner GPS is off, road provider unavailable, or auth missing.

## UX
- /owner/map → verified Owner privately starts/stops **Pricing GPS**. Snapshot refreshed while the page is open (watchPosition + stationary refresh). Only the Owner can enable it and exact Owner GPS is never returned by the quote API. Origin freshness must be under 3 minutes; expires in 15 minutes. This is separate from consent-based customer order live tracking.
- /order/new → customer's existing one-time GPS button AND new V9 GPS button capture the same order delivery pin and automatically request road pricing. Optional page-only watch updates the quote and eventual checkout GPS draft.
- /cart → same GPS interaction, with approved shop pickup locations included in complete route; no quote if shop GPS is absent.
- /map → select a pin on the in-website Leaflet map and explicitly press Calculate.
- Quote cards show road KM and LKR, estimate vs final confirmation, and state when unavailable.
- Private road origin is used server-side only by an authenticated Edge Function with service credentials in secure runtime. JWT verified and customer ownership checked before order quote persistence. User ID rate-limited to roughly once every 12 seconds.
- Existing active order totals / confirmed quotes are not silently changed.

## Database adjustments
- `useme_v9_actual_road_km_no_straight_line_quotes` migration:
  - Retains historical straight-line quotes as historical only, but stops generating new ones.
  - GPS changes now invalidate old quote entries, so stale distances are not reused.
  - Extends auto quote table with road-km, approximate travel duration and GPS accuracy, and new `road_route_roundtrip` / `road_route_multistop` calculation methods.
  - Private rate-limit table, no authenticated direct grant.
- Existing customer/owner role boundaries and previous checkout RPCs preserved.

## Verified
- Supabase Edge Function reports ACTIVE and verify_jwt=true.
- SQL formula tests: 22 KM -> 750; short 2 KM -> minimum 250; 22 KM + 100 Owner surcharge -> 850.
- Cloudflare read-back and rollout 100%.
- Browser-rendered public /order/new and /cart show the new controls and status text.
- Verified source code synchronizes GPS changes with the draft ultimately attached to an order, rather than quoting one pin and submitting another.
- Existing Shop products, Owner Orders and Promotions code preserved.

## Not yet verified end-to-end
- Owner-authenticated GPS capture on a physical phone + customer-authenticated GPS quote with real drivable route.
- Live OSRM upstream performance/reliability and full order checkout persistence during a genuine test order.
- OSRM demo backend is an external public route service with no production SLA; route calculation can be unavailable. Provide dedicated production routing infrastructure before large-scale launch.
- Exact route ETA is approximate and does not include traffic.
- Automatic pricing requires the Owner to activate a fresh GPS origin; no guessed location fallback.
- Full multi-shop cart checkout is not yet generally enabled (currently the cart is restricted to one shop); route service supports multiple known approved pickup pins for future expansion.
