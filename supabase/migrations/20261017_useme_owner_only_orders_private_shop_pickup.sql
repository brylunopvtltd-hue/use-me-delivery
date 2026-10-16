
-- Shop location details are private: only the shop itself and USE ME Owner may read them.
create table if not exists public.shop_pickup_details (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  pickup_address text not null check (length(trim(pickup_address)) between 8 and 500),
  contact_phone text not null check (length(trim(contact_phone)) between 7 and 30),
  pickup_notes text not null default '' check (length(pickup_notes)<=600),
  map_url text check (map_url is null or length(map_url)<=900),
  updated_at timestamptz not null default now()
);
alter table public.shop_pickup_details enable row level security;
drop policy if exists "useme private pickup owner and partner read" on public.shop_pickup_details;
create policy "useme private pickup owner and partner read"
on public.shop_pickup_details for select to authenticated
using (
  public.is_owner()
  or exists (select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid())
);
revoke all on public.shop_pickup_details from public,anon,authenticated;
grant select on public.shop_pickup_details to authenticated;

-- Single atomic registration prevents "shop pending" applications without pickup details.
create or replace function public.register_useme_shop(
  p_name text,p_address text,p_contact_phone text,p_notes text default ''
) returns uuid
language plpgsql security definer set search_path='public'
as $func$
declare new_shop uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if length(trim(coalesce(p_name,'')))<3 or length(trim(p_name))>100
 or length(trim(coalesce(p_address,'')))<8 or length(trim(p_address))>500
 or length(trim(coalesce(p_contact_phone,'')))<7 or length(trim(p_contact_phone))>30
 or length(coalesce(p_notes,''))>600 then
  raise exception 'Enter shop name, full pickup address and contact phone';
 end if;
 insert into public.shops(owner_id,name,status)
 values(auth.uid(),trim(p_name),'pending') returning id into new_shop;
 insert into public.shop_pickup_details(shop_id,pickup_address,contact_phone,pickup_notes)
 values(new_shop,trim(p_address),trim(p_contact_phone),trim(coalesce(p_notes,'')));
 return new_shop;
end $func$;
revoke execute on function public.register_useme_shop(text,text,text,text) from public,anon;
grant execute on function public.register_useme_shop(text,text,text,text) to authenticated;

-- Shop partners update *their own* location & contact; not approval or order management.
create or replace function public.update_useme_shop_pickup(
 p_shop_id uuid,p_address text,p_contact_phone text,p_notes text default '',p_map_url text default null
) returns void
language plpgsql security definer set search_path='public'
as $func$
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if not public.is_owner() and not exists (
  select 1 from public.shops s where s.id=p_shop_id and s.owner_id=auth.uid()
 ) then raise exception 'This shop is not yours'; end if;
 if length(trim(coalesce(p_address,'')))<8 or length(trim(p_address))>500
 or length(trim(coalesce(p_contact_phone,'')))<7 or length(trim(p_contact_phone))>30
 or length(coalesce(p_notes,''))>600
 or length(coalesce(p_map_url,''))>900 then
  raise exception 'Enter valid pickup address and phone';
 end if;
 if p_map_url is not null and trim(p_map_url)<>'' and
    p_map_url !~* '^https://(www[.])?google[.]com/maps/|^https://maps[.]app[.]goo[.]gl/' then
  raise exception 'Only Google Maps location links are supported';
 end if;
 insert into public.shop_pickup_details(shop_id,pickup_address,contact_phone,pickup_notes,map_url,updated_at)
 values(p_shop_id,trim(p_address),trim(p_contact_phone),trim(coalesce(p_notes,'')),nullif(trim(coalesce(p_map_url,'')),''),now())
 on conflict(shop_id) do update set pickup_address=excluded.pickup_address,contact_phone=excluded.contact_phone,
 pickup_notes=excluded.pickup_notes,map_url=excluded.map_url,updated_at=now();
end $func$;
revoke execute on function public.update_useme_shop_pickup(uuid,text,text,text,text) from public,anon;
grant execute on function public.update_useme_shop_pickup(uuid,text,text,text,text) to authenticated;

-- Customers and the USE ME Owner see an order. Listing partners cannot view personal order data.
drop policy if exists "orders scoped read" on public.orders;
create policy "orders customer or useme owner only" on public.orders
for select to authenticated using (customer_id=auth.uid() or public.is_owner());
drop policy if exists "order items scoped read" on public.order_items;
create policy "order items customer or useme owner only" on public.order_items
for select to authenticated using (
 exists(select 1 from public.orders o where o.id=order_items.order_id
 and (o.customer_id=auth.uid() or public.is_owner()))
);
drop policy if exists "events scoped read" on public.order_status_events;
create policy "events customer or useme owner only" on public.order_status_events
for select to authenticated using (
 exists(select 1 from public.orders o where o.id=order_status_events.order_id
 and (o.customer_id=auth.uid() or public.is_owner()))
);

CREATE OR REPLACE FUNCTION public.place_marketplace_order(p_shop_id uuid, p_recipient_name text, p_recipient_phone text, p_delivery_address text, p_distance_km numeric, p_road_surcharge numeric, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid();v_order uuid;v_subtotal numeric:=0;v_delivery numeric;v_item jsonb;v_product public.products%rowtype;v_qty integer;v_count integer:=0;
begin
 if v_user is null then raise exception 'Sign in required';end if;
 if length(trim(coalesce(p_recipient_name,'')))<2 or length(trim(coalesce(p_recipient_phone,'')))<7 or length(trim(coalesce(p_delivery_address,'')))<5 then raise exception 'Valid recipient information required';end if;
 if p_distance_km is null or p_distance_km<0 or p_distance_km>10000 or p_road_surcharge is null or p_road_surcharge<0 or p_road_surcharge>100000 then raise exception 'Invalid delivery estimate';end if;
 if not exists(select 1 from public.shops where id=p_shop_id and status='approved') then raise exception 'Shop unavailable';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>50 then raise exception 'Invalid cart';end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_count:=v_count+1;
  if coalesce(v_item->>'quantity','') !~ '^[0-9]+$' then raise exception 'Invalid quantity';end if;
  v_qty:=(v_item->>'quantity')::integer;
  if v_qty<1 or v_qty>100 then raise exception 'Quantity out of range';end if;
  select * into v_product from public.products where id=(v_item->>'product_id')::uuid and shop_id=p_shop_id and active=true for update;
  if not found or v_product.stock<v_qty then raise exception 'Product unavailable or insufficient stock';end if;
  v_subtotal:=v_subtotal+v_product.price_lkr*v_qty;
 end loop;
 v_delivery:=round(greatest(250,p_distance_km*750/22)+p_road_surcharge);
 insert into public.orders(customer_id,shop_id,recipient_name,recipient_phone,delivery_address,delivery_distance_km,delivery_fee_lkr,items_subtotal_lkr)
 values(v_user,p_shop_id,trim(p_recipient_name),trim(p_recipient_phone),trim(p_delivery_address),p_distance_km,v_delivery,v_subtotal) returning id into v_order;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_qty:=(v_item->>'quantity')::integer;
  select * into v_product from public.products where id=(v_item->>'product_id')::uuid and shop_id=p_shop_id and active=true for update;
  insert into public.order_items(order_id,product_id,product_name,quantity,unit_price_lkr) values(v_order,v_product.id,v_product.name,v_qty,v_product.price_lkr);
  update public.products set stock=stock-v_qty where id=v_product.id;
 end loop;
 insert into public.notifications(recipient_id,order_id,title,body)
 select id,v_order,'New USE ME order for '||(select name from public.shops where id=p_shop_id),'Customer order received · Review items, pickup shop and address in Owner Dashboard. Total estimate LKR '||(v_subtotal+v_delivery)::text from public.profiles where role='owner'
 union all select v_user,v_order,'Order placed','Your order is pending confirmation';
 return v_order;
end $function$;

CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_new_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 o public.orders%rowtype;v_old text;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found';end if;
 if not public.is_owner() then raise exception 'Not authorized';end if;
 if p_new_status not in ('accepted','preparing','ready','out_for_delivery','delivered','cancelled') then raise exception 'Invalid status';end if;
 if o.status in ('delivered','cancelled') then raise exception 'Order already closed';end if;
 if not(
 (o.status='pending' and p_new_status in ('accepted','cancelled')) or
 (o.status='accepted' and p_new_status in ('preparing','ready','cancelled')) or
 (o.status='preparing' and p_new_status in ('ready','cancelled')) or
 (o.status='ready' and p_new_status in ('out_for_delivery','delivered','cancelled')) or
 (o.status='out_for_delivery' and p_new_status in ('delivered','cancelled'))
 ) then raise exception 'Invalid status transition';end if;
 if o.status='pending' and p_new_status='accepted' and o.quote_confirmed_at is null then
  raise exception 'Owner must confirm the final quote before acceptance';
 end if;
 v_old:=o.status;
 update public.orders set status=p_new_status,updated_at=now() where id=p_order_id;
 if p_new_status='cancelled' and o.shop_id is not null then
  update public.products p set stock=p.stock+item.qty
  from (select product_id,sum(quantity)::integer qty
        from public.order_items
        where order_id=p_order_id and product_id is not null
        group by product_id) item
  where p.id=item.product_id and p.shop_id=o.shop_id;
 end if;
 insert into public.order_status_events(order_id,actor_id,old_status,new_status)
 values(p_order_id,auth.uid(),v_old,p_new_status);
 insert into public.notifications(recipient_id,order_id,title,body)
 values(o.customer_id,p_order_id,'Order status updated','Your order is now '||replace(p_new_status,'_',' '));
end $function$;

CREATE OR REPLACE FUNCTION public.useme_notify_order_managers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if new.status is distinct from old.status then
  insert into public.notifications(recipient_id,order_id,title,body)
  select recipient, new.id,'USE ME order updated',
    'Order '||left(new.id::text,8)||' is now '||replace(new.status,'_',' ')
  from (
    select p.id as recipient from public.profiles p where p.role='owner'
  ) t
  where recipient<>new.customer_id and recipient is distinct from auth.uid();
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.set_shop_approval(p_shop_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ begin if not public.is_owner() then raise exception 'Owner access required'; end if; if p_status not in ('approved','suspended','pending') then raise exception 'Invalid status'; end if; if p_status='approved' and not exists (select 1 from public.shop_pickup_details d where d.shop_id=p_shop_id and length(trim(d.pickup_address))>=8 and length(trim(d.contact_phone))>=7) then raise exception 'Shop pickup address and phone required before approval'; end if; update public.shops set status=p_status where id=p_shop_id; if not found then raise exception 'Shop not found'; end if; end $function$;
