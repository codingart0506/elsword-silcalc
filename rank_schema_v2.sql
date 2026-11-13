-- v2: 랭킹에 세팅 사진 공개 + 갱신 확인
--  · 랭킹에 보이는 캐릭터의 현재 스크린샷은 누구나 볼 수 있음
--  · 손으로 고친 값이 있거나 15% 넘게 오른 갱신은 관리자 확인 뒤 반영(보류)
--  · 그 밖의 갱신은 바로 반영되고, 관리자가 확인하거나 되돌릴 수 있음
alter table public.players add column if not exists shot_path text;
alter table public.cp_history add column if not exists status text not null default 'live';
alter table public.cp_history add column if not exists prev_cp bigint;
alter table public.cp_history add column if not exists prev_cls text;
alter table public.cp_history add column if not exists prev_inputs jsonb;
alter table public.cp_history add column if not exists prev_shot text;
alter table public.cp_history add column if not exists memo text;
alter table public.cp_history add column if not exists reviewed_at timestamptz;
alter table public.cp_history drop constraint if exists cp_history_status_chk;
alter table public.cp_history add constraint cp_history_status_chk
  check (status in ('live', 'held', 'checked', 'reverted', 'rejected'));
create index if not exists cp_history_status_idx on public.cp_history (status, created_at desc);

-- 랭킹에 보이는 캐릭터의 현재 사진만 공개
drop policy if exists "shots ranked read" on storage.objects;
create policy "shots ranked read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'shots' and exists (
    select 1 from public.players p where p.shot_path = storage.objects.name and not p.hidden));

-- 신청 승인: 신청 사진을 랭킹 사진으로
create or replace function public.approve_application(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a public.applications; v_pid uuid;
begin
  if not public.is_admin() then raise exception '관리자만 할 수 있어요'; end if;
  select * into a from public.applications where id = p_id for update;
  if a.id is null or a.status <> 'pending' then raise exception '이미 처리된 신청이에요'; end if;
  select id into v_pid from public.players where lower(nickname) = lower(a.nickname) and server = a.server;
  if v_pid is null then
    insert into public.players(nickname, server, cls, cp, inputs, shot_path)
    values (a.nickname, a.server, a.cls, a.cp, a.inputs, a.shot_path) returning id into v_pid;
  else
    update public.players set cls = a.cls, cp = a.cp, inputs = a.inputs, shot_path = a.shot_path, hidden = false, updated_at = now()
    where id = v_pid;
  end if;
  insert into public.player_secrets(player_id, token_hash) values (v_pid, a.token_hash)
  on conflict (player_id) do update set token_hash = excluded.token_hash, last_update = null;
  insert into public.cp_history(player_id, cp, cls, inputs, shot_path, status, reviewed_at)
  values (v_pid, a.cp, a.cls, a.inputs, a.shot_path, 'checked', now());
  update public.applications set status = 'approved', decided_at = now() where id = p_id;
  return v_pid;
end $$;

-- 갱신: 'live'(바로 반영) 또는 'held'(관리자 확인 뒤 반영)를 돌려줌
drop function if exists public.update_cp(text, text, bigint, jsonb, text, boolean);
create function public.update_cp(
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
  v_held := coalesce(p_edited, false) or p_cp > p.cp * 1.15;
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
grant execute on function public.update_cp(text, text, bigint, jsonb, text, boolean) to anon, authenticated;

-- 내 상태: 최근 갱신의 처리 결과도 함께
drop function if exists public.my_status(text);
create function public.my_status(p_token text)
returns table(status text, nickname text, server text, cp bigint, memo text, upd_status text, upd_cp bigint, upd_memo text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare h text := encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
begin
  return query
    select 'approved'::text, p.nickname, p.server, p.cp, null::text, l.status, l.cp, l.memo
    from public.player_secrets s
    join public.players p on p.id = s.player_id
    left join lateral (
      select c.status, c.cp, c.memo from public.cp_history c
      where c.player_id = p.id order by c.created_at desc limit 1) l on true
    where s.token_hash = h;
  if found then return; end if;
  return query
    select a.status, a.nickname, a.server, a.cp, a.memo, null::text, null::bigint, null::text
    from public.applications a
    where a.token_hash = h
    order by a.created_at desc limit 1;
end $$;
grant execute on function public.my_status(text) to anon, authenticated;

-- 관리자: 갱신 처리(approve: 보류 반영, reject: 보류 거절, check: 확인, revert: 되돌리기)
create or replace function public.review_update(p_id bigint, p_action text, p_memo text) returns void
language plpgsql security definer set search_path = public as $$
declare c public.cp_history;
begin
  if not public.is_admin() then raise exception '관리자만 할 수 있어요'; end if;
  select * into c from public.cp_history where id = p_id for update;
  if c.id is null then raise exception '기록이 없어요'; end if;
  if p_action = 'approve' then
    if c.status <> 'held' then raise exception '확인 기다리는 갱신이 아니에요'; end if;
    update public.players set cp = c.cp, cls = coalesce(c.cls, cls), inputs = coalesce(c.inputs, inputs),
           shot_path = coalesce(c.shot_path, shot_path), updated_at = now()
    where id = c.player_id;
    update public.cp_history set status = 'checked', reviewed_at = now() where id = p_id;
  elsif p_action = 'reject' then
    if c.status <> 'held' then raise exception '확인 기다리는 갱신이 아니에요'; end if;
    update public.cp_history set status = 'rejected', memo = left(p_memo, 200), reviewed_at = now() where id = p_id;
  elsif p_action = 'check' then
    if c.status <> 'live' then raise exception '이미 처리한 갱신이에요'; end if;
    update public.cp_history set status = 'checked', reviewed_at = now() where id = p_id;
  elsif p_action = 'revert' then
    if c.status not in ('live', 'checked') or c.prev_cp is null then raise exception '되돌릴 수 없는 기록이에요'; end if;
    update public.players set cp = c.prev_cp, cls = coalesce(c.prev_cls, cls), inputs = coalesce(c.prev_inputs, inputs),
           shot_path = c.prev_shot, updated_at = now()
    where id = c.player_id;
    update public.cp_history set status = 'reverted', memo = left(p_memo, 200), reviewed_at = now() where id = p_id;
  else
    raise exception '알 수 없는 동작이에요';
  end if;
end $$;
revoke execute on function public.review_update(bigint, text, text) from public, anon;
grant execute on function public.review_update(bigint, text, text) to authenticated;
