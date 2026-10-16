-- An approved shop owner may still have profiles.role='customer'.
-- Derive seller access from actual ownership of an approved shop.
create or replace function public.my_useme_role()
returns text language sql stable security definer set search_path to 'public' as $function$
  select case
    when exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='owner')
      then 'owner'
    when exists (select 1 from public.shops s where s.owner_id=auth.uid() and s.status='approved')
      then 'seller'
    else coalesce((select p.role from public.profiles p where p.id=auth.uid()), 'guest')
  end;
$function$;
revoke execute on function public.my_useme_role() from public,anon;
grant execute on function public.my_useme_role() to authenticated;
