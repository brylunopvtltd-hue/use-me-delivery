-- USE ME Phase 3 — approved merchant marketplace & product photographs.
-- Idempotent migration. Photos are public catalogue images; writes require seller ownership.
alter table public.products
  add column if not exists category text not null default 'General',
  add column if not exists description text not null default '',
  add column if not exists image_path text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.products'::regclass and conname='useme_product_image_shop_folder') then
    alter table public.products add constraint useme_product_image_shop_folder
      check (image_path is null or image_path like shop_id::text || '/%');
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.products'::regclass and conname='useme_live_products_need_photo') then
    alter table public.products add constraint useme_live_products_need_photo
      check (not active or (image_path is not null and length(image_path)>40));
  end if;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('product-images','product-images',true,12582912,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
public=excluded.public,file_size_limit=excluded.file_size_limit,
allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "useme public approved shop discovery" on public.shops;
create policy "useme public approved shop discovery" on public.shops
for select to anon using (status='approved');
revoke select on public.shops from anon;
grant select (id,name,status,created_at) on public.shops to anon;

drop policy if exists "useme approved sellers upload product photos" on storage.objects;
create policy "useme approved sellers upload product photos" on storage.objects
for insert to authenticated with check (
 bucket_id='product-images' and exists (
 select 1 from public.shops s
 where s.id::text=(storage.foldername(name))[1]
   and s.status='approved'
   and (s.owner_id=auth.uid() or public.is_owner())
 )
);
drop policy if exists "useme approved sellers remove product photos" on storage.objects;
create policy "useme approved sellers remove product photos" on storage.objects
for delete to authenticated using (
 bucket_id='product-images' and exists (
 select 1 from public.shops s
 where s.id::text=(storage.foldername(name))[1]
   and s.status='approved'
   and (s.owner_id=auth.uid() or public.is_owner())
 )
);

revoke execute on function public.set_shop_approval(uuid,text) from anon,public;
grant execute on function public.set_shop_approval(uuid,text) to authenticated;
