-- Dynamic live owner pricing and hard server-side service switches.
-- Only NEW orders are affected; existing accepted orders/quotes remain unchanged.
drop policy if exists "useme staff catalogue read" on public.products;
create policy "useme staff catalogue read" on public.products for select to authenticated
 using (public.useme_can_review_catalogue());
drop policy if exists "useme staff announcements read" on public.useme_announcements;
create policy "useme staff announcements read" on public.useme_announcements
 for select to authenticated using (public.useme_can_manage_announcements());

CREATE OR REPLACE FUNCTION public.place_marketplace_order(p_shop_id uuid, p_recipient_name text, p_recipient_phone text, p_delivery_address text, p_distance_km numeric, p_road_surcharge numeric, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid();v_order uuid;v_subtotal numeric:=0;v_delivery numeric;v_item jsonb;v_product public.products%rowtype;v_qty integer;v_count integer:=0;v_min numeric;v_km numeric;v_base numeric;v_enabled boolean;
begin
 if v_user is null then raise exception 'Sign in required';end if;
 select min_delivery_lkr,reference_roundtrip_km,reference_delivery_lkr,marketplace_enabled into v_min,v_km,v_base,v_enabled from public.useme_owner_settings where id=1;
 if not coalesce(v_enabled,false) then raise exception 'This USE ME service is temporarily paused by Owner';end if;
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
 v_delivery:=round(greatest(v_min,p_distance_km*v_base/v_km)+p_road_surcharge);
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

CREATE OR REPLACE FUNCTION public.place_service_order(p_service_type text, p_recipient_name text, p_recipient_phone text, p_delivery_address text, p_distance_km numeric, p_order_notes text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid();v_order uuid;v_delivery numeric;v_subtotal numeric:=0;v_min numeric;v_km numeric;v_base numeric;v_enabled boolean;
begin
 if v_user is null then raise exception 'Sign in required';end if;
 select min_delivery_lkr,reference_roundtrip_km,reference_delivery_lkr,service_orders_enabled into v_min,v_km,v_base,v_enabled from public.useme_owner_settings where id=1;
 if not coalesce(v_enabled,false) then raise exception 'This USE ME service is temporarily paused by Owner';end if;
 if p_service_type not in ('fresh_dosa','skin_care_combo','colombo_fashion','groceries','parcel') then raise exception 'Invalid service';end if;
 if length(trim(coalesce(p_recipient_name,'')))<2 or length(trim(coalesce(p_recipient_phone,'')))<7 or length(trim(coalesce(p_delivery_address,'')))<5 or length(coalesce(p_order_notes,''))>2000 then raise exception 'Valid contact, address and notes required';end if;
 if p_distance_km is null or p_distance_km<0 or p_distance_km>10000 then raise exception 'Invalid round-trip distance';end if;
 v_delivery:=round(greatest(v_min,p_distance_km*v_base/v_km));
 insert into public.orders(customer_id,service_type,recipient_name,recipient_phone,delivery_address,delivery_distance_km,delivery_fee_lkr,items_subtotal_lkr,order_notes)
 values(v_user,p_service_type,trim(p_recipient_name),trim(p_recipient_phone),trim(p_delivery_address),p_distance_km,v_delivery,v_subtotal,coalesce(p_order_notes,'')) returning id into v_order;
 insert into public.notifications(recipient_id,order_id,title,body)
 select id,v_order,'New USE ME service order','New '||p_service_type||' order request' from public.profiles where role='owner'
 union all select v_user,v_order,'Order request received','Your request is pending price and availability confirmation';
 return v_order;
end $function$;
