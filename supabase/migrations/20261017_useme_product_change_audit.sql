-- Record product publication, price and inventory changes without logging customer data.
create or replace function public.useme_audit_product_change()
returns trigger language plpgsql security definer set search_path='public' as $f$
begin
 if old.price_lkr is distinct from new.price_lkr
 or old.stock is distinct from new.stock
 or old.active is distinct from new.active then
  insert into public.useme_owner_audit(actor_id,action,target_kind,target_id,meta)
  values(auth.uid(),'product.updated','product',new.id::text,
   jsonb_build_object('previous_price',old.price_lkr,'new_price',new.price_lkr,
    'previous_stock',old.stock,'new_stock',new.stock,
    'previous_published',old.active,'new_published',new.active));
 end if;
 return new;
end $f$;
revoke execute on function public.useme_audit_product_change() from public,anon,authenticated;
drop trigger if exists useme_audit_product_change on public.products;
create trigger useme_audit_product_change after update of price_lkr,stock,active on public.products
for each row execute function public.useme_audit_product_change();
