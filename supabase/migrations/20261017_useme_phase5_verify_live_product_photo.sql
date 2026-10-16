-- Phase 5: published items must point to a real uploaded Storage object.
-- Product photo replacement first uploads the new image, updates DB, then
-- cleans up the now-unreferenced old image.
create or replace function public.useme_check_product_pickup()
returns trigger language plpgsql security definer set search_path='public'
as $function$
begin
 if new.active and (
   tg_op='INSERT' or old.active is distinct from new.active or old.image_path is distinct from new.image_path
 ) then
  if new.stock<=0 then
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

drop trigger if exists useme_check_product_pickup_on_write on public.products;
create trigger useme_check_product_pickup_on_write
before insert or update of active,image_path on public.products
for each row execute function public.useme_check_product_pickup();

drop policy if exists "useme approved sellers remove product photos" on storage.objects;
create policy "useme approved sellers remove product photos"
on storage.objects for delete to authenticated using (
 bucket_id='product-images'
 and exists(
  select 1 from public.shops sh
  where sh.id::text=(storage.foldername(storage.objects.name))[1]
  and sh.status='approved'
  and (sh.owner_id=auth.uid() or public.is_owner())
 )
 and not exists(
  select 1 from public.products p
  where p.image_path=storage.objects.name
 )
);
