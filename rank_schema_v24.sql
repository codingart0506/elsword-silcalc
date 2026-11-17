-- v24: 거절된 신청은 결과 안내용으로 7일만 두고 지움(매일 새벽 4시 20분에 정리)
create extension if not exists pg_cron;

create or replace function public.cleanup_rejected() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.applications where status = 'rejected' and coalesce(decided_at, created_at) < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.cleanup_rejected() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'silcalc-cleanup-rejected';
select cron.schedule('silcalc-cleanup-rejected', '20 19 * * *', 'select public.cleanup_rejected()');

select jobname, schedule, command, active from cron.job where jobname = 'silcalc-cleanup-rejected';
