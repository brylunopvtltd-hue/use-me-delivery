-- USE ME draft schema. Apply only to a NEW dedicated USE ME Supabase project.
create extension if not exists pgcrypto;
create table public.um_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '',
 created_at timestamptz not null default now()
);
create table public.um_shops (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 name text not null,
 status text not null default 'pending' check(status in ('pending','approved','suspended')),
 created_at timestamptz not null default now()
);
create table public.um_products (
 id uuid primary key default gen_random_uuid(),
 shop_id uuid not null references public.um_shops(id) on delete cascade,
 name text not null,
 price_lkr numeric(12,2) not null check(price_lkr>=0),
 stock_qty integer not null default 0 check(stock_qty>=0),
 active boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.um_orders (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references auth.users(id),
 status text not null default 'pending' check(status in ('pending','accepted','preparing','out_for_delivery','delivered','cancelled')),
 total_lkr numeric(12,2) not null default 0 check(total_lkr>=0),
 created_at timestamptz not null default now()
);
create table public.um_order_items (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.um_orders(id) on delete cascade,
 product_id uuid not null references public.um_products(id),
 quantity integer not null check(quantity>0),
 unit_price_lkr numeric(12,2) not null check(unit_price_lkr>=0)
);
alter table public.um_profiles enable row level security;
alter table public.um_shops enable row level security;
alter table public.um_products enable row level security;
alter table public.um_orders enable row level security;
alter table public.um_order_items enable row level security;
create policy "Profile owner read" on public.um_profiles for select to authenticated using ((select auth.uid())=id);
create policy "Profile owner insert" on public.um_profiles for insert to authenticated with check ((select auth.uid())=id);
create policy "Profile owner update" on public.um_profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
create policy "Approved shops public" on public.um_shops for select to anon,authenticated using (status='approved');
create policy "Owner sees own shop" on public.um_shops for select to authenticated using ((select auth.uid())=owner_id);
create policy "Owner registers shop" on public.um_shops for insert to authenticated with check ((select auth.uid())=owner_id and status='pending');
create policy "Public active products" on public.um_products for select to anon,authenticated using (active and exists(select 1 from public.um_shops s where s.id=shop_id and s.status='approved'));
create policy "Owner sees own products" on public.um_products for select to authenticated using (exists(select 1 from public.um_shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "Owner inserts products" on public.um_products for insert to authenticated with check (exists(select 1 from public.um_shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "Owner updates products" on public.um_products for update to authenticated using (exists(select 1 from public.um_shops s where s.id=shop_id and s.owner_id=(select auth.uid()))) with check (exists(select 1 from public.um_shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "Customer reads own orders" on public.um_orders for select to authenticated using ((select auth.uid())=customer_id);
create policy "Customer reads own order items" on public.um_order_items for select to authenticated using (exists(select 1 from public.um_orders o where o.id=order_id and o.customer_id=(select auth.uid())));
-- Security: NO client INSERT on orders/items. Implement server-side checkout that derives prices from DB, checks inventory atomically and authorizes merchant actions.
-- Security: merchant approval must be a trusted owner-only server operation, never a client-editable status.
