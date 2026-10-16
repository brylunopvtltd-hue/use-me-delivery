-- Prevent live listings and orders for shops with missing pickup information.
create or replace function public.useme_check_product_pickup()
returns trigger language plpgsql security definer set search_path='public' as $$
begin
 if new.active and (tg_op='INSERT' or old.active is distinct from new.active) then
  if not exists(select 1 from public.shops s join public.shop_pickup_details d on d.shop_id=s.id
    where s.id=new.shop_id and s.status='approved') then
    raise exception 'Complete shop pickup address and approval before publishing';
  end if;
 end if;
 return new;
end $$;
revoke execute on function public.useme_check_product_pickup() from public,anon,authenticated;
drop trigger if exists useme_check_product_pickup_on_write on public.products;
create trigger useme_check_product_pickup_on_write
before insert or update of active on public.products
for each row execute function public.useme_check_product_pickup();

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
 if not exists (select 1 from public.shop_pickup_details where shop_id=p_shop_id) then raise exception 'Shop pickup address not configured';end if;
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
