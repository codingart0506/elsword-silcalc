-- v7: 관리자가 랭킹 캐릭터를 지움(랭킹·갱신 기록·처리된 신청). 지울 사진 경로를 돌려주면 화면에서 사진도 지움
create or replace function public.admin_delete_player(p_id uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare v_nick text; v_paths text[];
begin
  if not public.is_admin() then raise exception '관리자만 할 수 있어요'; end if;
  select nickname into v_nick from public.players where id = p_id;
  if v_nick is null then raise exception '이미 지워진 캐릭터예요'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_paths from (
    select shot_path as x from public.players where id = p_id
    union select shot_path from public.cp_history where player_id = p_id
    union select prev_shot from public.cp_history where player_id = p_id
    union select shot_path from public.applications where lower(nickname) = lower(v_nick) and status <> 'pending'
  ) s where x is not null;
  delete from public.applications where lower(nickname) = lower(v_nick) and status <> 'pending';
  delete from public.players where id = p_id;
  return v_paths;
end $$;
revoke execute on function public.admin_delete_player(uuid) from public, anon;
grant execute on function public.admin_delete_player(uuid) to authenticated;
