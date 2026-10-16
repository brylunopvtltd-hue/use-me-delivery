-- Phase 5 adjustment: a product sold out from checkout remains active with
-- zero stock, and its merchant must still be able to replace its image.
-- Positive stock is required ONLY for initial publication; Storage verification
-- is required when publishing or changing the published product's image.
create or replace function public.useme_check_product_pickup()
returns trigger language plpgsql security definer set search_path='public'
as $function$
begin
 if new.active and (
   tg_op='INSERT' or old.active is distinct from new.active or old.image_path is distinct from new.image_path
 ) then
  if (tg_op='INSERT' or old.active is distinct from new.active) and new.stock<=0 then
   raise exception 'Save positive stock before publishing this product';
  end if;
  if not exists(select 1 from public.shops s
    join public.shop_pickup_details d on d.shop_id=s.id
    where s.id=new.shop_id and s.status='approved') then
   raise exception 'Complete shop pickup address and approval before publishing';
  end if;
  if new.image_path is null or not exists(
    select 1 from storage.objects so where so.bucket_id='product-images' and so.name=new.image_path
  ) then
   raise exception 'Upload a real product image before publishing';
  end if;
 end if;
 return new;
end $function$;
revoke execute on function public.useme_check_product_pickup() from public,anon,authenticated;
