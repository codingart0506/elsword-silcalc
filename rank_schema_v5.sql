-- v5: 랭킹(목록·세팅·사진)은 승인된 갱신 코드가 있는 사람과 관리자만 볼 수 있음
-- 브라우저는 갖고 있는 갱신 코드를 x-sil-token 헤더(쉼표로 최대 5개)로 보냄

create or replace function public.viewer_ok() returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare raw text; t text; n int := 0;
begin
  begin raw := current_setting('request.headers', true)::json->>'x-sil-token';
  exception when others then raw := null; end;
  if raw is null or raw = '' then return false; end if;
  foreach t in array string_to_array(left(raw, 200), ',') loop
    n := n + 1; exit when n > 5;
    t := upper(btrim(t));
    if length(t) >= 10 and exists (
      select 1 from public.player_secrets s join public.players p on p.id = s.player_id
      where s.token_hash = encode(digest(t, 'sha256'), 'hex') and not p.hidden) then
      return true;
    end if;
  end loop;
  return false;
end $$;
revoke execute on function public.viewer_ok() from public;
grant execute on function public.viewer_ok() to anon, authenticated;

-- 화면에서 볼 수 있는지 확인용
create or replace function public.can_view() returns boolean
language sql stable security definer set search_path = public as $$ select public.is_admin() or public.viewer_ok() $$;
revoke execute on function public.can_view() from public;
grant execute on function public.can_view() to anon, authenticated;

drop policy if exists "rank read" on public.players;
create policy "rank read" on public.players for select to anon, authenticated
  using ((select public.is_admin()) or (not hidden and (select public.viewer_ok())));

drop policy if exists "shots ranked read" on storage.objects;
create policy "shots ranked read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'shots' and (select public.viewer_ok()) and exists (
    select 1 from public.players p where p.shot_path = storage.objects.name and not p.hidden));
