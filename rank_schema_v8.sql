-- v8: 랭킹 열람 기록(누가·언제·무엇을·IP) + 숨긴 캐릭터는 열람도 차단
-- 랭킹 목록·상세·순위는 아래 함수로만 읽을 수 있고(읽을 때 기록), 표를 직접 읽는 건 관리자만

create table if not exists public.view_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  viewer uuid references public.players(id) on delete set null,
  viewer_nick text,
  kind text not null,
  target uuid,
  target_nick text,
  ip text,
  ua text
);
create index if not exists view_log_at on public.view_log (at desc);
create index if not exists view_log_viewer on public.view_log (viewer, at desc);
alter table public.view_log enable row level security;
drop policy if exists "view_log admin read" on public.view_log;
create policy "view_log admin read" on public.view_log for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete on public.view_log from anon, authenticated;

-- 요청에 실린 갱신 코드의 주인(숨기지 않은 랭킹 캐릭터)
create or replace function public.viewer_id() returns uuid
language plpgsql stable security definer set search_path = public, extensions as $$
declare raw text; t text; n int := 0; v uuid;
begin
  begin raw := current_setting('request.headers', true)::json->>'x-sil-token';
  exception when others then raw := null; end;
  if raw is null or raw = '' then return null; end if;
  foreach t in array string_to_array(left(raw, 200), ',') loop
    n := n + 1; exit when n > 5;
    t := upper(btrim(t));
    if length(t) >= 10 then
      select p.id into v from public.player_secrets s join public.players p on p.id = s.player_id
      where s.token_hash = encode(digest(t, 'sha256'), 'hex') and not p.hidden;
      if v is not null then return v; end if;
    end if;
  end loop;
  return null;
end $$;
revoke execute on function public.viewer_id() from public, anon, authenticated;

create or replace function public.viewer_ok() returns boolean
language sql stable security definer set search_path = public as $$ select public.viewer_id() is not null $$;
revoke execute on function public.viewer_ok() from public;
grant execute on function public.viewer_ok() to anon, authenticated;

-- 사진: 지금 랭킹에 걸린 사진만(표를 직접 못 읽어도 확인되게)
create or replace function public.shot_visible(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.players p where p.shot_path = p_name and not p.hidden) $$;
revoke execute on function public.shot_visible(text) from public;
grant execute on function public.shot_visible(text) to anon, authenticated;

create or replace function public.log_view(p_kind text, p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := public.viewer_id(); h json; v_ip text;
begin
  if v is null then return; end if; -- 관리자 열람은 남기지 않음
  begin h := current_setting('request.headers', true)::json; exception when others then h := null; end;
  v_ip := coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', nullif(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), ''));
  -- 목록은 같은 사람·같은 목록이면 10분에 한 번만
  if p_kind like 'list%' and exists (select 1 from public.view_log l where l.viewer = v and l.kind = p_kind and l.at > now() - interval '10 minutes') then return; end if;
  insert into public.view_log (viewer, viewer_nick, kind, target, target_nick, ip, ua)
  values (v, (select nickname from public.players where id = v), left(p_kind, 60), p_target,
          (select nickname from public.players where id = p_target), left(btrim(v_ip), 64), left(h->>'user-agent', 200));
  if random() < 0.02 then delete from public.view_log where at < now() - interval '180 days'; end if;
end $$;
revoke execute on function public.log_view(text, uuid) from public, anon, authenticated;

create or replace function public.rank_list(p_cls text default null, p_offset int default 0, p_limit int default 50)
returns table (id uuid, nickname text, cls text, cp bigint, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.viewer_ok()) then raise exception '랭킹은 랭킹에 올라간 사람만 볼 수 있어요'; end if;
  if coalesce(p_offset, 0) = 0 then
    perform public.log_view(case when coalesce(p_cls, '') = '' then 'list' else 'list:' || left(p_cls, 40) end, null);
  end if;
  return query
    select p.id, p.nickname, p.cls, p.cp, p.updated_at from public.players p
    where not p.hidden and (coalesce(p_cls, '') = '' or p.cls = p_cls)
    order by p.cp desc, p.updated_at
    offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 50), 1), 100);
end $$;

create or replace function public.rank_detail(p_id uuid)
returns table (inputs jsonb, shot_path text)
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.viewer_ok()) then raise exception '랭킹은 랭킹에 올라간 사람만 볼 수 있어요'; end if;
  perform public.log_view('detail', p_id);
  return query select p.inputs, p.shot_path from public.players p where p.id = p_id and not p.hidden;
end $$;

create or replace function public.rank_pos(p_cp bigint, p_cls text default null)
returns table (overall int, in_cls int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.viewer_ok()) then return; end if;
  return query select
    (select count(*)::int + 1 from public.players p where not p.hidden and p.cp > p_cp),
    case when coalesce(p_cls, '') = '' then null
         else (select count(*)::int + 1 from public.players p where not p.hidden and p.cls = p_cls and p.cp > p_cp) end;
end $$;

revoke execute on function public.rank_list(text, int, int) from public;
revoke execute on function public.rank_detail(uuid) from public;
revoke execute on function public.rank_pos(bigint, text) from public;
grant execute on function public.rank_list(text, int, int) to anon, authenticated;
grant execute on function public.rank_detail(uuid) to anon, authenticated;
grant execute on function public.rank_pos(bigint, text) to anon, authenticated;

-- 표 직접 읽기는 관리자만
drop policy if exists "rank read" on public.players;
create policy "rank read" on public.players for select to authenticated using ((select public.is_admin()));

drop policy if exists "shots ranked read" on storage.objects;
create policy "shots ranked read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'shots' and (select public.viewer_ok()) and public.shot_visible(name));
