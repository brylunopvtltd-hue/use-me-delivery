
-- USE ME OWNER CONTROL V4 / privilege is enforced in PostgreSQL, not CSS.
create table if not exists public.useme_owner_settings (
 id integer primary key default 1 check (id=1),
 min_delivery_lkr numeric not null default 250 check(min_delivery_lkr between 250 and 10000),
 reference_roundtrip_km numeric not null default 22 check(reference_roundtrip_km between 1 and 500),
 reference_delivery_lkr numeric not null default 750 check(reference_delivery_lkr between 250 and 100000),
 marketplace_enabled boolean not null default true,
 service_orders_enabled boolean not null default true,
 owner_whatsapp text not null default '94752351751' check(owner_whatsapp ~ '^94[0-9]{9}$'),
 support_note text not null default 'USE ME confirms the total before payment.' check(length(support_note)<=250),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 check(reference_delivery_lkr>=min_delivery_lkr)
);
insert into public.useme_owner_settings(id) values(1) on conflict(id) do nothing;
alter table public.useme_owner_settings enable row level security;
drop policy if exists "useme owner settings read" on public.useme_owner_settings;
create policy "useme owner settings read" on public.useme_owner_settings
 for select to authenticated using(public.is_owner());
revoke all on public.useme_owner_settings from public,anon,authenticated;
grant select on public.useme_owner_settings to authenticated;

create table if not exists public.useme_staff_permissions (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 can_manage_announcements boolean not null default false,
 can_review_catalogue boolean not null default false,
 granted_by uuid references auth.users(id),
 updated_at timestamptz not null default now()
);
alter table public.useme_staff_permissions enable row level security;
drop policy if exists "useme owner and self see staff grants" on public.useme_staff_permissions;
create policy "useme owner and self see staff grants" on public.useme_staff_permissions
 for select to authenticated using (public.is_owner() or user_id=auth.uid());
revoke all on public.useme_staff_permissions from public,anon,authenticated;
grant select on public.useme_staff_permissions to authenticated;

create table if not exists public.useme_announcements (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(trim(title)) between 3 and 120),
 body text not null check(length(trim(body)) between 5 and 1200),
 active boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 created_by uuid references auth.users(id)
);
alter table public.useme_announcements enable row level security;
drop policy if exists "useme published announcements" on public.useme_announcements;
create policy "useme published announcements" on public.useme_announcements
 for select to anon,authenticated using(active or public.is_owner());
revoke all on public.useme_announcements from public,anon,authenticated;
grant select on public.useme_announcements to anon,authenticated;

create table if not exists public.useme_owner_audit (
 id bigint generated always as identity primary key,
 actor_id uuid,
 action text not null check(length(action) between 3 and 100),
 target_kind text not null check(length(target_kind) between 2 and 80),
 target_id text,
 meta jsonb not null default '{}'::jsonb,
 happened_at timestamptz not null default now()
);
create index if not exists useme_owner_audit_time_idx on public.useme_owner_audit(happened_at desc);
alter table public.useme_owner_audit enable row level security;
drop policy if exists "useme platform owner reads audit" on public.useme_owner_audit;
create policy "useme platform owner reads audit" on public.useme_owner_audit
 for select to authenticated using(public.is_owner());
revoke all on public.useme_owner_audit from public,anon,authenticated;
grant select on public.useme_owner_audit to authenticated;

create or replace function public.useme_can_manage_announcements()
returns boolean language sql stable security definer set search_path='public'
as $f$
 select public.is_owner() or exists(
  select 1 from public.useme_staff_permissions
  where user_id=auth.uid() and can_manage_announcements=true);
$f$;
create or replace function public.useme_can_review_catalogue()
returns boolean language sql stable security definer set search_path='public'
as $f$
 select public.is_owner() or exists(
  select 1 from public.useme_staff_permissions
  where user_id=auth.uid() and can_review_catalogue=true);
$f$;
revoke execute on function public.useme_can_manage_announcements() from public,anon;
revoke execute on function public.useme_can_review_catalogue() from public,anon;
grant execute on function public.useme_can_manage_announcements(),public.useme_can_review_catalogue() to authenticated;

-- Public client configuration contains no private credentials.
create or replace function public.useme_public_config()
returns jsonb language sql stable security definer set search_path='public'
as $f$
 select jsonb_build_object(
   'min_delivery_lkr',min_delivery_lkr,
   'reference_roundtrip_km',reference_roundtrip_km,
   'reference_delivery_lkr',reference_delivery_lkr,
   'marketplace_enabled',marketplace_enabled,
   'service_orders_enabled',service_orders_enabled,
   'owner_whatsapp',owner_whatsapp,
   'support_note',support_note
 ) from public.useme_owner_settings where id=1;
$f$;
grant execute on function public.useme_public_config() to anon,authenticated;

-- Owner-only atomic settings write. Existing orders and confirmed quotes do not change.
create or replace function public.useme_owner_save_settings(p jsonb)
returns void language plpgsql security definer set search_path='public'
as $f$
declare oldrow public.useme_owner_settings%rowtype;
 v_min numeric; v_ref_km numeric; v_ref_fee numeric; v_phone text; v_note text;
begin
 if auth.uid() is null or not public.is_owner() then raise exception 'Owner access required';end if;
 if p is null or jsonb_typeof(p)<>'object' then raise exception 'Invalid settings payload';end if;
 if exists(select 1 from jsonb_object_keys(p) key
   where key not in ('min_delivery_lkr','reference_roundtrip_km','reference_delivery_lkr',
    'marketplace_enabled','service_orders_enabled','owner_whatsapp','support_note')) then
    raise exception 'Setting not editable';end if;
 select * into oldrow from public.useme_owner_settings where id=1 for update;
 if not found then raise exception 'Owner settings not initialized';end if;
 v_min:=coalesce((p->>'min_delivery_lkr')::numeric,oldrow.min_delivery_lkr);
 v_ref_km:=coalesce((p->>'reference_roundtrip_km')::numeric,oldrow.reference_roundtrip_km);
 v_ref_fee:=coalesce((p->>'reference_delivery_lkr')::numeric,oldrow.reference_delivery_lkr);
 v_phone:=coalesce(p->>'owner_whatsapp',oldrow.owner_whatsapp);
 v_note:=coalesce(p->>'support_note',oldrow.support_note);
 if v_min<250 or v_min>10000 or v_ref_km<1 or v_ref_km>500 or
    v_ref_fee<v_min or v_ref_fee>100000 or v_phone !~ '^94[0-9]{9}$'
    or length(v_note)>250 or length(trim(v_note))<5 then
   raise exception 'Please check fee ranges, Sri Lankan WhatsApp number, and support note';end if;
 if p ? 'marketplace_enabled' and jsonb_typeof(p->'marketplace_enabled')<>'boolean' then raise exception 'Marketplace switch must be true or false';end if;
 if p ? 'service_orders_enabled' and jsonb_typeof(p->'service_orders_enabled')<>'boolean' then raise exception 'Service switch must be true or false';end if;
 update public.useme_owner_settings
 set min_delivery_lkr=v_min,reference_roundtrip_km=v_ref_km,reference_delivery_lkr=v_ref_fee,
 marketplace_enabled=coalesce((p->>'marketplace_enabled')::boolean,oldrow.marketplace_enabled),
 service_orders_enabled=coalesce((p->>'service_orders_enabled')::boolean,oldrow.service_orders_enabled),
 owner_whatsapp=v_phone,support_note=trim(v_note),
 updated_at=now(),updated_by=auth.uid()
 where id=1;
 insert into public.useme_owner_audit(actor_id,action,target_kind,target_id,meta)
 values(auth.uid(),'settings.updated','settings','1',p);
end $f$;
revoke execute on function public.useme_owner_save_settings(jsonb) from public,anon;
grant execute on function public.useme_owner_save_settings(jsonb) to authenticated;

-- Owner can grant tightly scoped *content* permissions, never customer order access.
create or replace function public.useme_owner_grant_staff(
 p_user uuid,p_announcements boolean,p_catalogue boolean
) returns void language plpgsql security definer set search_path='public'
as $f$
begin
 if auth.uid() is null or not public.is_owner() then raise exception 'Owner access required';end if;
 if p_user is null or p_user=auth.uid() then raise exception 'Cannot grant staff access to this account';end if;
 if not exists(select 1 from public.profiles where id=p_user and role<>'owner') then raise exception 'Only existing non-owner accounts can become staff';end if;
 insert into public.useme_staff_permissions(user_id,can_manage_announcements,can_review_catalogue,granted_by,updated_at)
 values(p_user,coalesce(p_announcements,false),coalesce(p_catalogue,false),auth.uid(),now())
 on conflict(user_id) do update set can_manage_announcements=excluded.can_manage_announcements,
 can_review_catalogue=excluded.can_review_catalogue,granted_by=auth.uid(),updated_at=now();
 insert into public.useme_owner_audit(actor_id,action,target_kind,target_id,meta)
 values(auth.uid(),'staff.permissions.changed','staff',p_user::text,
   jsonb_build_object('announcements',p_announcements,'catalogue',p_catalogue));
end $f$;
revoke execute on function public.useme_owner_grant_staff(uuid,boolean,boolean) from public,anon;
grant execute on function public.useme_owner_grant_staff(uuid,boolean,boolean) to authenticated;

-- Staff content actions may NOT touch owner settings, shop approvals, orders, users, or GPS.
create or replace function public.useme_save_announcement(
 p_id uuid,p_title text,p_body text,p_active boolean
) returns uuid language plpgsql security definer set search_path='public'
as $f$
declare v_id uuid;
begin
 if auth.uid() is null or not public.useme_can_manage_announcements() then raise exception 'Announcement permission required';end if;
 if length(trim(coalesce(p_title,''))) not between 3 and 120 or
 length(trim(coalesce(p_body,''))) not between 5 and 1200 then raise exception 'Title or message length invalid';end if;
 if p_id is null then
  insert into public.useme_announcements(title,body,active,created_by)
  values(trim(p_title),trim(p_body),coalesce(p_active,false)) returning id into v_id;
 else
  update public.useme_announcements set title=trim(p_title),body=trim(p_body),
  active=coalesce(p_active,false),updated_at=now()
  where id=p_id returning id into v_id;
  if v_id is null then raise exception 'Announcement not found';end if;
 end if;
 insert into public.useme_owner_audit(actor_id,action,target_kind,target_id,meta)
 values(auth.uid(),'announcement.saved','announcement',v_id::text,jsonb_build_object('active',p_active));
 return v_id;
end $f$;
revoke execute on function public.useme_save_announcement(uuid,text,text,boolean) from public,anon;
grant execute on function public.useme_save_announcement(uuid,text,text,boolean) to authenticated;

create or replace function public.useme_review_catalogue_item(p_product uuid,p_active boolean)
returns void language plpgsql security definer set search_path='public'
as $f$
declare r public.products%rowtype;
begin
 if auth.uid() is null or not public.useme_can_review_catalogue() then raise exception 'Product review permission required';end if;
 select * into r from public.products where id=p_product for update;
 if not found then raise exception 'Product not found';end if;
 if p_active and (
  r.image_path is null or r.stock<=0 or
  not exists(select 1 from public.shops s join public.shop_pickup_details loc on loc.shop_id=s.id
             where s.id=r.shop_id and s.status='approved')
 ) then raise exception 'This product needs stock, image and approved shop pickup details';end if;
 update public.products set active=coalesce(p_active,false) where id=p_product;
 insert into public.useme_owner_audit(actor_id,action,target_kind,target_id,meta)
 values(auth.uid(),'product.reviewed','product',p_product::text,jsonb_build_object('published',p_active));
end $f$;
revoke execute on function public.useme_review_catalogue_item(uuid,boolean) from public,anon;
grant execute on function public.useme_review_catalogue_item(uuid,boolean) to authenticated;

-- Owner audit of existing owner-only status and shop-approval updates, without personal data.
create or replace function public.useme_record_admin_mutation()
returns trigger language plpgsql security definer set search_path='public' as $f$
begin
 if tg_table_name='orders' then
  if old.status is distinct from new.status then
   insert into public.useme_owner_audit(actor_id,action,target_kind,target_id,meta)
   values(auth.uid(),'order.status.updated','order',new.id::text,jsonb_build_object('from',old.status,'to',new.status));
  end if;
 elsif tg_table_name='shops' then
  if old.status is distinct from new.status then
   insert into public.useme_owner_audit(actor_id,action,target_kind,target_id,meta)
   values(auth.uid(),'shop.status.updated','shop',new.id::text,jsonb_build_object('from',old.status,'to',new.status));
  end if;
 end if;
 return new;
end $f$;
revoke execute on function public.useme_record_admin_mutation() from public,anon,authenticated;
drop trigger if exists useme_audit_order_status_update on public.orders;
create trigger useme_audit_order_status_update after update of status on public.orders
 for each row execute function public.useme_record_admin_mutation();
drop trigger if exists useme_audit_shop_status_update on public.shops;
create trigger useme_audit_shop_status_update after update of status on public.shops
 for each row execute function public.useme_record_admin_mutation();
