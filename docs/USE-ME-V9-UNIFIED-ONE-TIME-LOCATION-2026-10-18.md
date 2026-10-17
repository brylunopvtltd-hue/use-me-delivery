# USE ME V9 — Unified One-Time Location / Change When Needed
**Date:** 2026-10-18

## Production
- Site: https://use-me-superapp-web.bryluno-zunora.workers.dev/
- Cloudflare Worker: `use-me-superapp-web`
- Production deployment: `7ca18554-cfc1-4d94-ac75-7da3ccd9fec5`
- Worker version: `c3e5cf6b-f17f-4a29-b33d-b338287c6303`, 100% traffic
- Supabase: `woytuayeuyfvucttvosw`
- Supabase Edge Function `useme-v9-road-quote` version 2 ACTIVE / JWT required
- PWA revision: `use-me-static-v22-unified3`

## Customer
- New global **Set My Location / Change Location** selector in the header, available on every page.
- Customer explicitly chooses device GPS once, taps map pin, enters coordinates, or uses previously named private account place. Existing GPS permissions are controlled by the browser; site cannot guarantee browser permission persists forever.
- Current choice appears on every page, persists on this device. Signed-in users additionally synchronize the preferred location to their private Supabase account row.
- The **same preferred location** is used when clicking location buttons on Cart, Delivery Order, service pages, personal location map, saved address selection, and on existing order's "Share delivery location" action.
- New location immediately refreshes checkout GPS drafts. Existing placed orders are NOT silently moved; customer explicitly shares a location with an active order when desired.
- Customer can use any other map pin using **Use This Pin Across USE ME**, choose "Change Location", or clear the saved location. Merely viewing or tapping a map does NOT silently replace preferred location until customer saves it.
- Preserves existing manually typed address; enters optional saved address in empty fields. Customer should verify any manually typed address matches the pin before checkout.
- Shop registration/pickup still has a separately confirmable shop-location save step. Changing personal location does NOT automatically change shop GPS or existing orders.
- GPS watchPosition and Owner live order tracking are never turned on by setting a preferred location.

## Owner
- Owner can explicitly save a **fixed dispatch BASE** using their preferred location, once, and edit/remove it when the pickup origin changes. Server guards this with `is_owner()`, never returns Owner coordinates to customers.
- `useme-v9-road-quote` uses fresh Owner **live** pricing GPS when deliberately enabled, or the saved dispatch base when there is no fresh live origin.
- A saved dispatch base is not labeled live GPS. Customer sees only total road distance and indicative LKR fee, pending owner final price.
- The selected fixed base stays until changed/deleted; Owner's explicit GPS live tracking and time-bound order sharing remain separate workflows.

## Database changes
- `useme_v9_preferred_locations`: one private signed-in preference per user, RLS restricts to `auth.uid()`.
- `useme_v9_owner_dispatch_base`: private singleton fixed dispatch base; `SELECT` RLS Owner only, no direct authenticated INSERT. Only verified Owner RPCs can save/clear.
- Migration: `useme_v9_one_time_preferred_location_and_owner_dispatch_base`.
- No existing Orders, shopping cart records, verified shops, delivery fees or reward balances were modified by migration.

## Sources
- `v9/useme-v9-unified-location.js`: one-time user preference, consent-based GPS, map picker, global top bar, explicit change/clear.
- `v9/useme-v9-unified-location.css`: responsive mobile/desktop UI.
- `v9/useme-v9-road-fee.js`: quote reuse, distinguish saved base from live GPS, preserve consent.
- `v9/supabase/useme-v9-road-quote/index.ts`: protected actual road-route fee; privacy-safe saved base fallback.
- **Important:** Production Worker bundle is source of truth; GitHub root index.html is an older file and MUST NOT overwrite deployed Worker.

## QA conducted
- Browser-rendered public site returns new global location bar with "Set My Location".
- In an isolated anonymous browser, programmatically save a fake QA map pin (7.3,81.7). Header changes to saved pin; cart GPS draft/preview and service order GPS draft/preview inherit the same position. Returning Home keeps selected location.
- In an isolated anonymous browser, open location dialog; GPS and Map options rendered. Preview mock map coordinates (7.40001,81.40001), confirm pin; dialog closes and header + map use the new selected location.
- SQL role checks: anonymous cannot read private preferences; authenticated direct insert on Owner base denied. Row Level Security policies verified.
- Cloudflare readback: 100% traffic, original Shop Products still above marketing banners, old Owner Orders, owner campaign manager and V8 module IDs preserved.
- GPS accuracy unmeasured for manually selected map pins (never presented as ±0m).

## Follow-up / not yet verified
- Actual handset geolocation permission and reload persistence on a customer's own device (requires user action).
- Logged-in preferred location sync and cross-device retrieval, Owner-only RPC setting fixed base, actual OSRM request end-to-end with two real GPS locations, and checkout placement with an owner final quote; cannot claim those were fully tested without authorized live sessions.
- No background/continuous GPS by default; on a new browser/device permission may still require browser approval.
- Router uses OSRM public endpoint with limited availability; request manual owner quote when route provider is unavailable.
