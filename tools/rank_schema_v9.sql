-- v9: 피시방·특수(지애·랜미) 버프를 켠 세팅(inputs.ZB1/ZB2가 '미적용'이 아님)은 신청·갱신 자체를 거절
create or replace function public.no_rank_buff() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(new.inputs->>'ZB1', '미적용') <> '미적용' or coalesce(new.inputs->>'ZB2', '미적용') <> '미적용' then
    raise exception '피시방·지애·랜미 버프를 켠 세팅은 랭킹에 올릴 수 없어요';
  end if;
  return new;
end $$;
drop trigger if exists applications_no_buff on public.applications;
create trigger applications_no_buff before insert on public.applications for each row execute function public.no_rank_buff();
drop trigger if exists cp_history_no_buff on public.cp_history;
create trigger cp_history_no_buff before insert on public.cp_history for each row execute function public.no_rank_buff();
