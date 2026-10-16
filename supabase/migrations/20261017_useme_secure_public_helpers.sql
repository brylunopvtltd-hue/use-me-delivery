-- Tested with a rollback-only published product under role anon before applying.
-- The public catalogue must not require privileged seller helper function execution.
drop policy if exists "products public approved" on public.products;
create policy "products public approved" on public.products
for select to anon, authenticated
using (
  active and exists (
    select 1 from public.shops s
    where s.id=products.shop_id and s.status='approved'
  )
);
-- Trigger function is invoked by the trusted database trigger, not by browsers.
revoke execute on function public.create_customer_profile() from public, anon, authenticated;
revoke execute on function public.is_owner() from public, anon;
revoke execute on function public.owns_shop(uuid) from public, anon;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.owns_shop(uuid) to authenticated;
