-- USE ME Phase 4 least privilege hardening.
-- The buyer/seller/owner client reads RLS-scoped order data; all order writes
-- are made through trusted Postgres RPCs (SECURITY DEFINER with identity checks).
revoke insert,update,delete,truncate on
 public.orders, public.order_items, public.order_status_events
 from public,anon,authenticated;
revoke all on public.orders, public.order_items, public.order_status_events from anon;
grant select on public.orders, public.order_items, public.order_status_events to authenticated;

-- Notification creation requires trusted DB functions/triggers, not ordinary users.
revoke all on public.notifications from anon;
revoke insert,delete,truncate,update on public.notifications from public,authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
-- Trigger functions are internal only.
revoke execute on function public.useme_notify_shop_application() from public,anon,authenticated;
revoke execute on function public.useme_notify_shop_approval() from public,anon,authenticated;
revoke execute on function public.useme_notify_order_managers() from public,anon,authenticated;
