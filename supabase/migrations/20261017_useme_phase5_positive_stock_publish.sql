-- Phase 5: require positive saved inventory on initial publication;
-- stock may later reach zero through fulfilled orders without breaking checkout.
create or replace function public.useme_check_product_pickup()
returns trigger language plpgsql security definer set search_path='public'
as $function$
begin
 if new.active and (tg_op='INSERT' or old.active is distinct from new.active) then
  if new.stock<=0 then
   raise exception 'Save positive stock before publishing this product';
  end if;
  if not exists(select 1 from public.shops s
    join public.shop_pickup_details d on d.shop_id=s.id
    where s.id=new.shop_id and s.status='approved') then
    raise exception 'Complete shop pickup address and approval before publishing';
  end if;
 end if;
 return new;
end $function$;
revoke execute on function public.useme_check_product_pickup() from public,anon,authenticated;
