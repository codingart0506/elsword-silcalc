-- v3: 사진 올리기 남용 막기(1분에 30장, 전체 3000장까지)
create or replace function public.shots_upload_ok() returns boolean
language sql stable security definer set search_path = public, storage as $$
  select (select count(*) from storage.objects where bucket_id = 'shots' and created_at > now() - interval '1 minute') < 30
     and (select count(*) from storage.objects where bucket_id = 'shots') < 3000;
$$;
grant execute on function public.shots_upload_ok() to anon, authenticated;
drop policy if exists "shots upload" on storage.objects;
create policy "shots upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'shots' and (storage.foldername(name))[1] in ('apply', 'update') and public.shots_upload_ok());
