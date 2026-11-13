-- 실투력 랭킹 (Supabase)
-- 공개 키로는 랭킹 목록 읽기와 아래 함수 호출만 가능. 표에 직접 쓰기는 막혀 있음.
create extension if not exists pgcrypto with schema extensions;

-- 관리자
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.admins where user_id = auth.uid());
$$;

-- 처음 로그인한 한 사람만 관리자가 됨(이미 관리자가 있으면 본인 여부만 알려줌)
create or replace function public.claim_admin() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if exists(select 1 from public.admins) then
    return exists(select 1 from public.admins where user_id = auth.uid());
  end if;
  insert into public.admins(user_id) values (auth.uid());
  return true;
end $$;

-- 랭킹에 보이는 캐릭터
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  server text not null,
  cls text not null,
  cp bigint not null check (cp >= 0),
  inputs jsonb not null default '{}'::jsonb,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists players_nick_uq on public.players (lower(nickname), server);
create index if not exists players_cp_idx on public.players (cp desc);
alter table public.players enable row level security;
drop policy if exists "rank read" on public.players;
create policy "rank read" on public.players for select to anon, authenticated using (not hidden or public.is_admin());
drop policy if exists "admin update" on public.players;
create policy "admin update" on public.players for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin delete" on public.players;
create policy "admin delete" on public.players for delete to authenticated using (public.is_admin());

-- 갱신 코드(해시만 저장, 공개 API로는 접근 불가)
create table if not exists public.player_secrets (
  player_id uuid primary key references public.players(id) on delete cascade,
  token_hash text not null,
  last_update timestamptz
);
alter table public.player_secrets enable row level security;

-- 랭킹 신청
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  server text not null,
  cls text not null,
  cp bigint not null,
  inputs jsonb not null default '{}'::jsonb,
  verify_code text not null,
  shot_path text,
  token_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  memo text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.applications enable row level security;
drop policy if exists "admin all" on public.applications;
create policy "admin all" on public.applications for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 갱신 기록(관리자 확인용)
create table if not exists public.cp_history (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  cp bigint not null,
  cls text,
  inputs jsonb,
  shot_path text,
  edited boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.cp_history enable row level security;
drop policy if exists "admin read" on public.cp_history;
create policy "admin read" on public.cp_history for select to authenticated using (public.is_admin());

-- 신청
create or replace function public.submit_application(
  p_nickname text, p_server text, p_cls text, p_cp bigint, p_inputs jsonb,
  p_code text, p_shot text, p_token text
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_n text := btrim(coalesce(p_nickname, ''));
begin
  if char_length(v_n) < 1 or char_length(v_n) > 20 then raise exception '닉네임을 확인해 주세요'; end if;
  if p_server not in ('솔레스', '가이아') then raise exception '서버를 골라 주세요'; end if;
  if p_cp is null or p_cp <= 0 or p_cp > 100000000000 then raise exception '실투력 값이 이상해요'; end if;
  if char_length(coalesce(p_token, '')) < 16 then raise exception '갱신 코드가 올바르지 않아요'; end if;
  if pg_column_size(p_inputs) > 20000 then raise exception '입력값이 너무 커요'; end if;
  if (select count(*) from public.applications
      where status = 'pending' and lower(nickname) = lower(v_n) and server = p_server) >= 3 then
    raise exception '이미 신청이 들어가 있어요. 승인을 기다려 주세요';
  end if;
  if (select count(*) from public.applications where created_at > now() - interval '1 minute') > 20 then
    raise exception '신청이 몰리고 있어요. 잠시 후 다시 시도해 주세요';
  end if;
  insert into public.applications(nickname, server, cls, cp, inputs, verify_code, shot_path, token_hash)
  values (v_n, p_server, left(coalesce(p_cls, ''), 40), p_cp, coalesce(p_inputs, '{}'::jsonb),
          left(coalesce(p_code, ''), 20), left(p_shot, 200), encode(digest(p_token, 'sha256'), 'hex'))
  returning id into v_id;
  return v_id;
end $$;

-- 내 신청·등록 상태(갱신 코드로 확인)
create or replace function public.my_status(p_token text)
returns table(status text, nickname text, server text, cp bigint, memo text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare h text := encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
begin
  return query
    select 'approved'::text, p.nickname, p.server, p.cp, null::text
    from public.player_secrets s join public.players p on p.id = s.player_id
    where s.token_hash = h;
  if found then return; end if;
  return query
    select a.status, a.nickname, a.server, a.cp, a.memo
    from public.applications a
    where a.token_hash = h
    order by a.created_at desc limit 1;
end $$;

-- 승인된 사람이 스크린샷으로 실투력 갱신
create or replace function public.update_cp(
  p_token text, p_cls text, p_cp bigint, p_inputs jsonb, p_shot text, p_edited boolean
) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid; v_last timestamptz;
begin
  select player_id, last_update into v_pid, v_last
  from public.player_secrets where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if v_pid is null then raise exception '등록된 갱신 코드가 아니에요'; end if;
  if v_last is not null and v_last > now() - interval '30 seconds' then raise exception '잠시 후 다시 갱신해 주세요'; end if;
  if p_cp is null or p_cp <= 0 or p_cp > 100000000000 then raise exception '실투력 값이 이상해요'; end if;
  if pg_column_size(p_inputs) > 20000 then raise exception '입력값이 너무 커요'; end if;
  update public.players set cp = p_cp, cls = left(coalesce(p_cls, cls), 40), inputs = coalesce(p_inputs, '{}'::jsonb), updated_at = now()
  where id = v_pid;
  update public.player_secrets set last_update = now() where player_id = v_pid;
  insert into public.cp_history(player_id, cp, cls, inputs, shot_path, edited)
  values (v_pid, p_cp, left(p_cls, 40), p_inputs, left(p_shot, 200), coalesce(p_edited, false));
  return p_cp;
end $$;

-- 관리자: 승인 / 거절
create or replace function public.approve_application(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a public.applications; v_pid uuid;
begin
  if not public.is_admin() then raise exception '관리자만 할 수 있어요'; end if;
  select * into a from public.applications where id = p_id for update;
  if a.id is null or a.status <> 'pending' then raise exception '이미 처리된 신청이에요'; end if;
  select id into v_pid from public.players where lower(nickname) = lower(a.nickname) and server = a.server;
  if v_pid is null then
    insert into public.players(nickname, server, cls, cp, inputs)
    values (a.nickname, a.server, a.cls, a.cp, a.inputs) returning id into v_pid;
  else
    update public.players set cls = a.cls, cp = a.cp, inputs = a.inputs, hidden = false, updated_at = now() where id = v_pid;
  end if;
  insert into public.player_secrets(player_id, token_hash) values (v_pid, a.token_hash)
  on conflict (player_id) do update set token_hash = excluded.token_hash, last_update = null;
  insert into public.cp_history(player_id, cp, cls, inputs, shot_path) values (v_pid, a.cp, a.cls, a.inputs, a.shot_path);
  update public.applications set status = 'approved', decided_at = now() where id = p_id;
  return v_pid;
end $$;

create or replace function public.reject_application(p_id uuid, p_memo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '관리자만 할 수 있어요'; end if;
  update public.applications set status = 'rejected', memo = left(p_memo, 200), decided_at = now()
  where id = p_id and status = 'pending';
end $$;

-- 함수 실행 권한
revoke execute on function public.claim_admin() from public, anon;
grant execute on function public.claim_admin() to authenticated;
revoke execute on function public.approve_application(uuid) from public, anon;
grant execute on function public.approve_application(uuid) to authenticated;
revoke execute on function public.reject_application(uuid, text) from public, anon;
grant execute on function public.reject_application(uuid, text) to authenticated;
grant execute on function public.submit_application(text, text, text, bigint, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.my_status(text) to anon, authenticated;
grant execute on function public.update_cp(text, text, bigint, jsonb, text, boolean) to anon, authenticated;

-- 스크린샷 저장소(비공개, 업로드만 누구나, 보기는 관리자만)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shots', 'shots', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "shots upload" on storage.objects;
create policy "shots upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'shots' and (storage.foldername(name))[1] in ('apply', 'update'));
drop policy if exists "shots admin read" on storage.objects;
create policy "shots admin read" on storage.objects for select to authenticated
  using (bucket_id = 'shots' and public.is_admin());
drop policy if exists "shots admin delete" on storage.objects;
create policy "shots admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'shots' and public.is_admin());
