-- v25: 디스코드 알림에서 '관리자 화면' 줄과 링크를 뺌(건수만 알림)
create or replace function public.notify_new_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.status = 'pending' then
    select count(*) into n from public.applications where status = 'pending';
    perform public.notify_discord('[랭킹 신청] 새 신청이 들어왔어요 (확인 대기 ' || n || '건)');
  end if;
  return new;
exception when others then
  return new;
end $$;

create or replace function public.notify_cp_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.status = 'held' then
    select count(*) into n from public.cp_history where status = 'held';
    perform public.notify_discord('[갱신 확인 요청] 새 갱신 확인 요청이 들어왔어요 (확인 대기 ' || n || '건)');
  end if;
  return new;
exception when others then
  return new;
end $$;

select 'ok' as done;
