-- Phase 5: idempotent customer checkout. A network retry must never create
-- a second purchase/delivery order. No direct table reads/writes are exposed.
create table if not exists public.useme_order_requests (
 request_id uuid primary key,
 customer_id uuid not null references auth.users(id) on delete cascade,
 order_id uuid references public.orders(id) on delete set null,
 created_at timestamptz not null default now()
);
alter table public.useme_order_requests enable row level security;
revoke all on public.useme_order_requests from public,anon,authenticated;

create or replace function public.place_marketplace_order_once(
 p_shop_id uuid,p_recipient_name text,p_recipient_phone text,p_delivery_address text,
 p_distance_km numeric,p_road_surcharge numeric,p_items jsonb,p_request_id uuid
) returns uuid language plpgsql security definer set search_path='public'
as $function$
declare v_id uuid;v_customer uuid;v_existing uuid;
begin
 v_customer:=auth.uid();
 if v_customer is null then raise exception 'Sign in required';end if;
 if p_request_id is null then raise exception 'Checkout request ID required';end if;
 insert into public.useme_order_requests(request_id,customer_id)
 values(p_request_id,v_customer) on conflict(request_id) do nothing;
 select customer_id,order_id into v_customer,v_existing
 from public.useme_order_requests where request_id=p_request_id for update;
 if not found or v_customer<>auth.uid() then
   raise exception 'Checkout request does not belong to this account';
 end if;
 if v_existing is not null then return v_existing;end if;
 v_id:=public.place_marketplace_order(p_shop_id,p_recipient_name,p_recipient_phone,
                                     p_delivery_address,p_distance_km,p_road_surcharge,p_items);
 update public.useme_order_requests set order_id=v_id where request_id=p_request_id;
 return v_id;
end $function$;
revoke execute on function public.place_marketplace_order_once(uuid,text,text,text,numeric,numeric,jsonb,uuid)
 from public,anon;
grant execute on function public.place_marketplace_order_once(uuid,text,text,text,numeric,numeric,jsonb,uuid)
 to authenticated;

create or replace function public.place_service_order_once(
 p_service_type text,p_recipient_name text,p_recipient_phone text,p_delivery_address text,
 p_distance_km numeric,p_order_notes text,p_request_id uuid
) returns uuid language plpgsql security definer set search_path='public'
as $function$
declare v_id uuid;v_customer uuid;v_existing uuid;
begin
 v_customer:=auth.uid();
 if v_customer is null then raise exception 'Sign in required';end if;
 if p_request_id is null then raise exception 'Checkout request ID required';end if;
 insert into public.useme_order_requests(request_id,customer_id)
 values(p_request_id,v_customer) on conflict(request_id) do nothing;
 select customer_id,order_id into v_customer,v_existing
 from public.useme_order_requests where request_id=p_request_id for update;
 if not found or v_customer<>auth.uid() then
   raise exception 'Checkout request does not belong to this account';
 end if;
 if v_existing is not null then return v_existing;end if;
 v_id:=public.place_service_order(p_service_type,p_recipient_name,p_recipient_phone,
                                  p_delivery_address,p_distance_km,p_order_notes);
 update public.useme_order_requests set order_id=v_id where request_id=p_request_id;
 return v_id;
end $function$;
revoke execute on function public.place_service_order_once(text,text,text,text,numeric,text,uuid)
 from public,anon;
grant execute on function public.place_service_order_once(text,text,text,text,numeric,text,uuid)
 to authenticated;
