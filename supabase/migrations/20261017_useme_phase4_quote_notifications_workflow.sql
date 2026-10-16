-- USE ME Phase 4. Applied in Supabase via 3 production migrations:
-- useme_phase4_owner_quote_and_order_shop_inapp_notifications
-- useme_phase4_quote_before_accept_and_customer_pending_cancel
-- useme_phase4_enable_secure_notification_realtime
-- Reproducible schema/function snapshot. Existing Phase 1-3 migration prerequisites apply.
alter table public.orders
 add column if not exists final_items_subtotal_lkr numeric,
 add column if not exists final_delivery_fee_lkr numeric,
 add column if not exists quote_confirmed_at timestamptz,
 add column if not exists quote_confirmed_by uuid references auth.users(id);

do $$
begin
 if not exists(
  select 1 from pg_constraint
  where conrelid='public.orders'::regclass and conname='useme_final_quote_complete'
 ) then
  alter table public.orders add constraint useme_final_quote_complete check (
    (final_items_subtotal_lkr is null and final_delivery_fee_lkr is null and quote_confirmed_at is null and quote_confirmed_by is null)
    or (final_items_subtotal_lkr is not null and final_items_subtotal_lkr>=0
        and final_delivery_fee_lkr is not null and final_delivery_fee_lkr>=250
        and quote_confirmed_at is not null and quote_confirmed_by is not null)
  );
 end if;
end $$;

CREATE OR REPLACE FUNCTION public.cancel_my_pending_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o public.orders%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found or o.customer_id<>auth.uid() then raise exception 'Order not found for this account';end if;
 if o.status<>'pending' then raise exception 'Only pending orders can be cancelled online';end if;
 update public.orders set status='cancelled',updated_at=now() where id=o.id;
 if o.shop_id is not null then
  update public.products p set stock=p.stock+i.qty
   from (select product_id,sum(quantity)::integer qty from public.order_items
         where order_id=o.id and product_id is not null group by product_id) i
   where p.id=i.product_id and p.shop_id=o.shop_id;
 end if;
 insert into public.order_status_events(order_id,actor_id,old_status,new_status)
 values(o.id,auth.uid(),'pending','cancelled');
 insert into public.notifications(recipient_id,order_id,title,body)
 values(o.customer_id,o.id,'Order cancelled','Your pending order was cancelled. No online payment was taken.');
end $function$;

CREATE OR REPLACE FUNCTION public.confirm_order_quote(p_order_id uuid, p_delivery_fee_lkr numeric, p_items_subtotal_lkr numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o public.orders%rowtype;
  v_items numeric;
begin
  if auth.uid() is null or not public.is_owner() then
    raise exception 'Owner permission required';
  end if;
  if p_order_id is null then raise exception 'Order reference required'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status in ('cancelled','delivered') then raise exception 'Closed orders cannot be quoted'; end if;
  if o.quote_confirmed_at is not null then raise exception 'Quote already confirmed'; end if;
  if p_delivery_fee_lkr is null or p_delivery_fee_lkr<250 or p_delivery_fee_lkr>100000 then
    raise exception 'Invalid final delivery fee';
  end if;
  if o.shop_id is not null then
    -- For a real marketplace order, protect server-calculated product totals.
    v_items:=o.items_subtotal_lkr;
    if p_items_subtotal_lkr is not null and p_items_subtotal_lkr<>v_items then
      raise exception 'Marketplace item prices cannot be overridden';
    end if;
  else
    if p_items_subtotal_lkr is null or p_items_subtotal_lkr<0 or p_items_subtotal_lkr>10000000 then
      raise exception 'Service item price is required';
    end if;
    v_items:=round(p_items_subtotal_lkr,2);
  end if;
  update public.orders
     set final_items_subtotal_lkr=v_items,
         final_delivery_fee_lkr=round(p_delivery_fee_lkr,2),
         quote_confirmed_at=now(),
         quote_confirmed_by=auth.uid(),
         updated_at=now()
   where id=o.id;

  insert into public.notifications(recipient_id,order_id,title,body)
  values(o.customer_id,o.id,'USE ME final quote confirmed',
    'Confirmed quote: LKR '||to_char(v_items+round(p_delivery_fee_lkr,2),'FM99999999990.00')||'. Please confirm details with USE ME before paying. Order status: '||replace(o.status,'_',' '));
end $function$;

CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_new_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 o public.orders%rowtype;v_old text;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found';end if;
 if not(public.is_owner() or (o.shop_id is not null and public.owns_shop(o.shop_id))) then raise exception 'Not authorized';end if;
 if p_new_status not in ('accepted','preparing','ready','out_for_delivery','delivered','cancelled') then raise exception 'Invalid status';end if;
 if o.status in ('delivered','cancelled') then raise exception 'Order already closed';end if;
 if not(
 (o.status='pending' and p_new_status in ('accepted','cancelled')) or
 (o.status='accepted' and p_new_status in ('preparing','ready','cancelled')) or
 (o.status='preparing' and p_new_status in ('ready','cancelled')) or
 (o.status='ready' and p_new_status in ('out_for_delivery','delivered','cancelled')) or
 (o.status='out_for_delivery' and p_new_status in ('delivered','cancelled'))
 ) then raise exception 'Invalid status transition';end if;
 if o.status='pending' and p_new_status='accepted' and o.quote_confirmed_at is null then
  raise exception 'Owner must confirm the final quote before acceptance';
 end if;
 v_old:=o.status;
 update public.orders set status=p_new_status,updated_at=now() where id=p_order_id;
 if p_new_status='cancelled' and o.shop_id is not null then
  update public.products p set stock=p.stock+item.qty
  from (select product_id,sum(quantity)::integer qty
        from public.order_items
        where order_id=p_order_id and product_id is not null
        group by product_id) item
  where p.id=item.product_id and p.shop_id=o.shop_id;
 end if;
 insert into public.order_status_events(order_id,actor_id,old_status,new_status)
 values(p_order_id,auth.uid(),v_old,p_new_status);
 insert into public.notifications(recipient_id,order_id,title,body)
 values(o.customer_id,p_order_id,'Order status updated','Your order is now '||replace(p_new_status,'_',' '));
end $function$;

CREATE OR REPLACE FUNCTION public.useme_notify_order_managers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if new.status is distinct from old.status then
  insert into public.notifications(recipient_id,order_id,title,body)
  select recipient, new.id,'USE ME order updated',
    'Order '||left(new.id::text,8)||' is now '||replace(new.status,'_',' ')
  from (
    select p.id as recipient from public.profiles p where p.role='owner'
    union
    select s.owner_id as recipient from public.shops s where s.id=new.shop_id
  ) t
  where recipient<>new.customer_id and recipient is distinct from auth.uid();
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.useme_notify_shop_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if new.status='pending' then
  insert into public.notifications(recipient_id,title,body)
  select id,'New shop application','A shop named "'||left(new.name,85)||'" is awaiting approval.'
  from public.profiles where role='owner' and id<>new.owner_id;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.useme_notify_shop_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if new.status is distinct from old.status then
  insert into public.notifications(recipient_id,title,body)
  values(new.owner_id,'USE ME shop '||new.status,
    'Your shop "'||left(new.name,85)||'" is now '||new.status||'.');
 end if;
 return new;
end $function$;


-- Least privilege: browser clients cannot manufacture notifications or change notice content.
revoke insert,delete,truncate,update on public.notifications from public,anon,authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke execute on function public.mark_notification_read(uuid) from public,anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

revoke execute on function public.confirm_order_quote(uuid,numeric,numeric) from public,anon;
grant execute on function public.confirm_order_quote(uuid,numeric,numeric) to authenticated;
revoke execute on function public.cancel_my_pending_order(uuid) from public,anon;
grant execute on function public.cancel_my_pending_order(uuid) to authenticated;

-- PostgreSQL triggers use these SECURITY DEFINER functions internally, not via browser RPC.
revoke execute on function public.useme_notify_shop_application() from public,anon,authenticated;
revoke execute on function public.useme_notify_shop_approval() from public,anon,authenticated;
revoke execute on function public.useme_notify_order_managers() from public,anon,authenticated;

drop trigger if exists useme_notify_shop_application_insert on public.shops;
create trigger useme_notify_shop_application_insert
 after insert on public.shops for each row
 execute function public.useme_notify_shop_application();
drop trigger if exists useme_notify_shop_approval_update on public.shops;
create trigger useme_notify_shop_approval_update
 after update of status on public.shops for each row
 execute function public.useme_notify_shop_approval();
drop trigger if exists useme_notify_order_managers_update on public.orders;
create trigger useme_notify_order_managers_update
 after update of status on public.orders for each row
 execute function public.useme_notify_order_managers();

do $$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
 and not exists(select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
   alter publication supabase_realtime add table public.notifications;
 end if;
end $$;
