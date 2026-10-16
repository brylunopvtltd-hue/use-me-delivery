-- Anonymous visitors can read published service notices without invoking owner-only helper functions.
drop policy if exists "useme published announcements" on public.useme_announcements;
create policy "useme published announcements" on public.useme_announcements
 for select to anon,authenticated using (active=true);
drop policy if exists "useme owner announcements read" on public.useme_announcements;
create policy "useme owner announcements read" on public.useme_announcements
 for select to authenticated using (public.is_owner());
-- Already-existing authenticated Staff select policy remains scoped to explicit grants.
