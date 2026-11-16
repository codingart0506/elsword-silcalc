-- v21: 디스코드 알림에서 개인정보(닉네임·전직·실투력)를 빼고 건수만 보냄
--  · 누가 신청했는지는 관리자 화면에서 확인
create or replace function public.notify_new_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.status = 'pending' then
    select count(*) into n from public.applications where status = 'pending';
    perform public.notify_discord('[랭킹 신청] 새 신청이 들어왔어요 (확인 대기 ' || n || '건)'
      || chr(10) || '관리자 화면: https://codingart0506.github.io/elsword-silcalc/?admin');
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
    perform public.notify_discord('[갱신 확인 요청] 새 갱신 확인 요청이 들어왔어요 (확인 대기 ' || n || '건)'
      || chr(10) || '관리자 화면: https://codingart0506.github.io/elsword-silcalc/?admin');
  end if;
  return new;
exception when others then
  return new;
end $$;

select 'ok' as done;
