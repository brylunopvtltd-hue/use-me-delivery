
-- USE ME: optional consent-based coordinate snapshots. No background tracking is stored.
alter table public.shop_pickup_details
 add column if not exists latitude numeric,
 add column if not exists longitude numeric,
 add column if not exists location_accuracy_m numeric,
 add column if not exists location_shared_at timestamptz;
alter table public.orders
 add column if not exists delivery_latitude numeric,
 add column if not exists delivery_longitude numeric,
 add column if not exists delivery_location_accuracy_m numeric,
 add column if not exists delivery_location_shared_at timestamptz;

do $$
begin
 if not exists(select 1 from pg_constraint where conrelid='public.shop_pickup_details'::regclass and conname='useme_shop_valid_location') then
  alter table public.shop_pickup_details add constraint useme_shop_valid_location check(
   (latitude is null and longitude is null and location_accuracy_m is null and location_shared_at is null)
   or (latitude between -90 and 90 and longitude between -180 and 180 and location_accuracy_m between 0 and 100000 and location_shared_at is not null)
  );
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='useme_order_valid_location') then
  alter table public.orders add constraint useme_order_valid_location check(
   (delivery_latitude is null and delivery_longitude is null and delivery_location_accuracy_m is null and delivery_location_shared_at is null)
   or (delivery_latitude between -90 and 90 and delivery_longitude between -180 and 180 and delivery_location_accuracy_m between 0 and 100000 and delivery_location_shared_at is not null)
  );
 end if;
end $$;

-- Shop owners may save the current location of their own shop only, never a customer's address.
create or replace function public.set_shop_pickup_coordinates(
 p_shop_id uuid,p_lat numeric,p_lng numeric,p_accuracy_m numeric default 0
) returns void
language plpgsql security definer set search_path='public'
as $function$
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if not public.is_owner() and not exists(select 1 from public.shops where id=p_shop_id and owner_id=auth.uid()) then
   raise exception 'Shop does not belong to this account';
 end if;
 if p_lat is null or p_lat not between -90 and 90
 or p_lng is null or p_lng not between -180 and 180
 or p_accuracy_m is null or p_accuracy_m not between 0 and 100000 then
   raise exception 'Invalid GPS coordinates';
 end if;
 update public.shop_pickup_details
 set latitude=p_lat,longitude=p_lng,location_accuracy_m=p_accuracy_m,location_shared_at=now(),updated_at=now()
 where shop_id=p_shop_id;
 if not found then raise exception 'Save a shop pickup address before sharing location';end if;
end $function$;

create or replace function public.clear_shop_pickup_coordinates(p_shop_id uuid)
returns void language plpgsql security definer set search_path='public'
as $function$
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 if not public.is_owner() and not exists(select 1 from public.shops where id=p_shop_id and owner_id=auth.uid()) then
  raise exception 'Shop does not belong to this account';
 end if;
 update public.shop_pickup_details
 set latitude=null,longitude=null,location_accuracy_m=null,location_shared_at=null,updated_at=now()
 where shop_id=p_shop_id;
end $function$;

-- The customer must explicitly click to share a location snapshot with their order.
-- Buyer may update it while order is active; owner only reads it for delivery.
create or replace function public.share_my_order_delivery_location(
 p_order_id uuid,p_lat numeric,p_lng numeric,p_accuracy_m numeric default 0
) returns void language plpgsql security definer set search_path='public'
as $function$
declare v_status text;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 if p_lat is null or p_lat not between -90 and 90
 or p_lng is null or p_lng not between -180 and 180
 or p_accuracy_m is null or p_accuracy_m not between 0 and 100000 then
  raise exception 'Invalid GPS coordinates';
 end if;
 select status into v_status from public.orders
 where id=p_order_id and customer_id=auth.uid() for update;
 if not found then raise exception 'Order not found for this customer';end if;
 if v_status in ('delivered','cancelled') then raise exception 'This order is already closed';end if;
 update public.orders
 set delivery_latitude=p_lat,delivery_longitude=p_lng,delivery_location_accuracy_m=p_accuracy_m,
 delivery_location_shared_at=now(),updated_at=now()
 where id=p_order_id and customer_id=auth.uid();
end $function$;

create or replace function public.clear_my_order_delivery_location(p_order_id uuid)
returns void language plpgsql security definer set search_path='public'
as $function$
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 update public.orders
 set delivery_latitude=null,delivery_longitude=null,
 delivery_location_accuracy_m=null,delivery_location_shared_at=null,updated_at=now()
 where id=p_order_id and customer_id=auth.uid();
 if not found then raise exception 'Order not found for this customer';end if;
end $function$;

revoke execute on function public.set_shop_pickup_coordinates(uuid,numeric,numeric,numeric) from public,anon;
grant execute on function public.set_shop_pickup_coordinates(uuid,numeric,numeric,numeric) to authenticated;
revoke execute on function public.clear_shop_pickup_coordinates(uuid) from public,anon;
grant execute on function public.clear_shop_pickup_coordinates(uuid) to authenticated;
revoke execute on function public.share_my_order_delivery_location(uuid,numeric,numeric,numeric) from public,anon;
grant execute on function public.share_my_order_delivery_location(uuid,numeric,numeric,numeric) to authenticated;
revoke execute on function public.clear_my_order_delivery_location(uuid) from public,anon;
grant execute on function public.clear_my_order_delivery_location(uuid) to authenticated;
