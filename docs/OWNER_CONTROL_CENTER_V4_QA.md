# USE ME — Owner Full Control Center V4
Deployment date: 2026-10-17. Production worker: use-me-superapp-web. Supabase project: woytuayeuyfvucttvosw.

## Executive summary
A new independent `/owner` control centre is available **only after Supabase Owner authorization**. A second `/team` URL supports limited, explicit staff capabilities. Existing Home markup was compared to approved GitHub reference and is byte-for-byte unchanged.

### Owner UI sections
1. **Overview:** 8 verified counters and links to private order operations, route maps, in-app notifications, and up to 500 most recent orders CSV export. "Confirmed order value" is not cash collected.
2. **Shops:** review approved/pending/suspended partner shops, pickup contact details, approve only when location is available, suspend or reopen review.
3. **Products:** view all active/unpublished merchant items, toggle visibility with a protected RPC, adjust price and stock with owner RLS.
4. **Users & permissions:** inspect account profiles; grant/revoke two explicit independent capabilities: `can_manage_announcements` and `can_review_catalogue`. Full Owner role is NEVER delegated. Shop partners do not see customer orders or GPS.
5. **Announcements:** create, edit and publish/unpublish messages for `/shop`, `/offers`, `/send`, and `/order/new`, while preserving approved Home.
6. **Settings:** Supabase-persisted minimum delivery fee, reference round-trip distance, reference fee, marketplace orders ON/OFF, service orders ON/OFF, editable owner WhatsApp number and support note. Server-side order RPCs enforce price and pause settings. Existing orders are not repriced.
7. **Security & Audit:** limited staff capability matrix, private event history for order status, shop status, product changes, announcements, staff permissions and owner settings. No online payment or automatic WhatsApp integration is claimed.

### Staff capabilities
- `/team` requires a signed-in account and an actual permission grant or verified platform Owner role.
- Staff may perform authorized announcement saves via `useme_save_announcement()`, and/or product publication via `useme_review_catalogue_item()`.
- Staff cannot access `/owner` details, update Owner settings or permissions, approve shops, manage customer Orders, read customer addresses or locations, or set delivery status.
- App and database enforce permissions independently.

### Deployment and tests
- Supabase: `useme_owner_control_settings_staff_announcements_audit`, `useme_live_owner_pricing_and_staff_scoped_read`, `useme_owner_announcement_created_by_fix`, `useme_public_announcements_guest_permission_fix`, `useme_product_price_stock_audit_history` applied.
- All test data modifications executed inside transactions with `ROLLBACK`.
- Changing Owner test fee to LKR 880 / 22 km produced LKR 880 on a new test service order; minimum LKR 300 set temporarily. Original rates restored by rollback (250 min, 22 km / 750).
- Turning service checkout OFF prevented new requests inside server RPC. Turning marketplace checkout OFF prevented attempts even before shop lookup. Old requests unaffected.
- Non-owner Owner Settings and Staff Grant RPC requests refused.
- Staff could publish a test announcement after explicit temporary grant, but their identity was still not a full Owner. Without permission, announcements refused.
- Published announcements appeared to guest/anon while drafts did not. Public read RLS was corrected to avoid calling owner-only helpers from an anonymous session.
- Product price and stock update generated an audit event with old/new values in a rollback test.
- Anonymous users cannot call privileged mutation functions, and non-owner users cannot SELECT private settings (RLS).
- Worker deployed on Cloudflare at 100% traffic. Guest mobile browser `/owner` and `/team` routes display authorization gates with private panels hidden.
- Authenticated Owner browser functionality and Android PWA UI still require manual acceptance testing with the actual Owner account.

### Remaining production/security requirements
- No WhatsApp Business Cloud API currently connected. The `94752351751` number is for manual prefilled messages, NOT automatic order notification delivery.
- No background PWA push notifications or automated payment processing implemented.
- Supabase Auth leaked password protection warning persists. `SECURITY DEFINER` advisor flags include one deliberately anonymous, data-whitelisted `useme_public_config()` and privileged authenticated RPCs requiring careful maintenance. Never expose service-role keys in browser code or GitHub.
- At the time of prior audit, 1 shop was suspended and 1 pending; no published real products. Review real shop pickup details and test an Owner/customer flow before general public launch.
- Audit logs start at migration introduction, are not retroactive, and record control-plane changes only. CSV exports are private and may contain customer PII; safeguard downloaded files.

## Security boundary
Owner permission is determined server-side through `public.is_owner()` and `public.profiles.role='owner'`. The front end hides panels for usability, but database RLS and narrow SECURITY DEFINER RPC checks are authoritative. Do not enable shop owners to access customer Orders or route GPS merely by granting content capabilities.
