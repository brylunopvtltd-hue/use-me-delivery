-- Null-safe GPS coordinate integrity for optional location sharing.
alter table public.shop_pickup_details
 drop constraint if exists useme_shop_valid_location;
alter table public.shop_pickup_details
 add constraint useme_shop_valid_location check (
  (latitude is null and longitude is null and location_accuracy_m is null and location_shared_at is null)
  or (latitude is not null and longitude is not null and location_accuracy_m is not null and location_shared_at is not null
      and latitude between -90 and 90 and longitude between -180 and 180 and location_accuracy_m between 0 and 100000)
 );
alter table public.orders
 drop constraint if exists useme_order_valid_location;
alter table public.orders
 add constraint useme_order_valid_location check (
  (delivery_latitude is null and delivery_longitude is null and delivery_location_accuracy_m is null and delivery_location_shared_at is null)
  or (delivery_latitude is not null and delivery_longitude is not null
      and delivery_location_accuracy_m is not null and delivery_location_shared_at is not null
      and delivery_latitude between -90 and 90 and delivery_longitude between -180 and 180
      and delivery_location_accuracy_m between 0 and 100000)
 );
