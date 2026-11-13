-- v6: 실투력이 조금이라도 오른 갱신은 관리자 확인 뒤 반영(보류). 그대로거나 내려가면 바로 반영
create or replace function public.update_cp(
  p_token text, p_cls text, p_cp bigint, p_inputs jsonb, p_shot text, p_edited boolean
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid; v_last timestamptz; p public.players; v_held boolean;
begin
  select player_id, last_update into v_pid, v_last
  from public.player_secrets where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if v_pid is null then raise exception '등록된 갱신 코드가 아니에요'; end if;
  if v_last is not null and v_last > now() - interval '30 seconds' then raise exception '잠시 후 다시 갱신해 주세요'; end if;
  if p_cp is null or p_cp <= 0 or p_cp > 100000000000 then raise exception '실투력 값이 이상해요'; end if;
  if pg_column_size(p_inputs) > 20000 then raise exception '입력값이 너무 커요'; end if;
  if p_shot is null or p_shot !~ '^update/' then raise exception '스크린샷이 필요해요'; end if;
  select * into p from public.players where id = v_pid;
  v_held := coalesce(p_edited, false) or p_cp > p.cp;
  update public.player_secrets set last_update = now() where player_id = v_pid;
  insert into public.cp_history(player_id, cp, cls, inputs, shot_path, edited, status, prev_cp, prev_cls, prev_inputs, prev_shot)
  values (v_pid, p_cp, left(p_cls, 40), p_inputs, left(p_shot, 200), coalesce(p_edited, false),
          case when v_held then 'held' else 'live' end, p.cp, p.cls, p.inputs, p.shot_path);
  if v_held then return 'held'; end if;
  update public.players set cp = p_cp, cls = left(coalesce(p_cls, cls), 40), inputs = coalesce(p_inputs, '{}'::jsonb),
         shot_path = left(p_shot, 200), updated_at = now()
  where id = v_pid;
  return 'live';
end $$;
