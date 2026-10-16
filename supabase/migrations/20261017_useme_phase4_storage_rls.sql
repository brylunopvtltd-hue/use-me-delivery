-- USE ME Phase 4: Supabase Storage RLS fix.
-- The previous nested EXISTS used an unqualified "name" which resolved to
-- shops.name rather than the storage.objects file path.
drop policy if exists "useme approved sellers upload product photos" on storage.objects;
create policy "useme approved sellers upload product photos" on storage.objects
for insert to authenticated with check (
  bucket_id='product-images' and exists (
    select 1 from public.shops sh
     where sh.id::text=(storage.foldername(storage.objects.name))[1]
       and sh.status='approved'
       and (sh.owner_id=auth.uid() or public.is_owner())
  )
);
drop policy if exists "useme approved sellers inspect product photos" on storage.objects;
create policy "useme approved sellers inspect product photos" on storage.objects
for select to authenticated using (
  bucket_id='product-images' and exists (
    select 1 from public.shops sh
     where sh.id::text=(storage.foldername(storage.objects.name))[1]
       and sh.status='approved'
       and (sh.owner_id=auth.uid() or public.is_owner())
  )
);
drop policy if exists "useme approved sellers remove product photos" on storage.objects;
create policy "useme approved sellers remove product photos" on storage.objects
for delete to authenticated using (
  bucket_id='product-images' and exists (
    select 1 from public.shops sh
     where sh.id::text=(storage.foldername(storage.objects.name))[1]
       and sh.status='approved'
       and (sh.owner_id=auth.uid() or public.is_owner())
  )
);
