-- Prevent permanently consumed inventory when a pending/accepted marketplace order is cancelled.
-- Order row is locked; a cancelled/delivered order cannot be cancelled twice.
create or replace function public.set_order_status(p_order_id uuid, p_new_status text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  o public.orders%rowtype;
  v_old text;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not (public.is_owner() or (o.shop_id is not null and public.owns_shop(o.shop_id))) then
    raise exception 'Not authorized';
  end if;
  if p_new_status not in ('accepted','preparing','ready','out_for_delivery','delivered','cancelled') then
    raise exception 'Invalid status';
  end if;
  if o.status in ('delivered','cancelled') then raise exception 'Order already closed'; end if;
  if not (
    (o.status='pending' and p_new_status in ('accepted','cancelled')) or
    (o.status='accepted' and p_new_status in ('preparing','ready','cancelled')) or
    (o.status='preparing' and p_new_status in ('ready','cancelled')) or
    (o.status='ready' and p_new_status in ('out_for_delivery','delivered','cancelled')) or
    (o.status='out_for_delivery' and p_new_status in ('delivered','cancelled'))
  ) then raise exception 'Invalid status transition'; end if;
  v_old:=o.status;
  update public.orders set status=p_new_status,updated_at=now() where id=p_order_id;
  if p_new_status='cancelled' and o.shop_id is not null then
    update public.products p
       set stock=p.stock+item.quantity_to_restore
      from (
        select product_id,sum(quantity)::integer as quantity_to_restore
          from public.order_items
         where order_id=p_order_id and product_id is not null
         group by product_id
      ) item
     where p.id=item.product_id and p.shop_id=o.shop_id;
  end if;
  insert into public.order_status_events(order_id,actor_id,old_status,new_status)
  values(p_order_id,auth.uid(),v_old,p_new_status);
  insert into public.notifications(recipient_id,order_id,title,body)
  values(o.customer_id,p_order_id,'Order status updated','Your order is now '||replace(p_new_status,'_',' '));
end $function$;
