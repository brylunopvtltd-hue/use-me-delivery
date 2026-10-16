CREATE OR REPLACE FUNCTION public.useme_save_announcement(p_id uuid, p_title text, p_body text, p_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
 if auth.uid() is null or not public.useme_can_manage_announcements() then raise exception 'Announcement permission required';end if;
 if length(trim(coalesce(p_title,''))) not between 3 and 120 or
 length(trim(coalesce(p_body,''))) not between 5 and 1200 then raise exception 'Title or message length invalid';end if;
 if p_id is null then
  insert into public.useme_announcements(title,body,active,created_by)
  values(trim(p_title),trim(p_body),coalesce(p_active,false),auth.uid()) returning id into v_id;
 else
  update public.useme_announcements set title=trim(p_title),body=trim(p_body),
  active=coalesce(p_active,false),updated_at=now()
  where id=p_id returning id into v_id;
  if v_id is null then raise exception 'Announcement not found';end if;
 end if;
 insert into public.useme_owner_audit(actor_id,action,target_kind,target_id,meta)
 values(auth.uid(),'announcement.saved','announcement',v_id::text,jsonb_build_object('active',p_active));
 return v_id;
end $function$
;
