-- v4: 서버 구분 없앰(솔레스·가이아 통합). 신청은 서버 없이 닉네임으로만 받음
create or replace function public.submit_application(
  p_nickname text, p_server text, p_cls text, p_cp bigint, p_inputs jsonb,
  p_code text, p_shot text, p_token text
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_n text := btrim(coalesce(p_nickname, ''));
begin
  if char_length(v_n) < 1 or char_length(v_n) > 20 then raise exception '닉네임을 확인해 주세요'; end if;
  if p_cp is null or p_cp <= 0 or p_cp > 100000000000 then raise exception '실투력 값이 이상해요'; end if;
  if char_length(coalesce(p_token, '')) < 16 then raise exception '갱신 코드가 올바르지 않아요'; end if;
  if pg_column_size(p_inputs) > 20000 then raise exception '입력값이 너무 커요'; end if;
  if p_shot is null or p_shot !~ '^apply/' then raise exception '스크린샷이 필요해요'; end if;
  if (select count(*) from public.applications where status = 'pending' and lower(nickname) = lower(v_n)) >= 3 then
    raise exception '이미 신청이 들어가 있어요. 승인을 기다려 주세요';
  end if;
  if (select count(*) from public.applications where created_at > now() - interval '1 minute') > 20 then
    raise exception '신청이 몰리고 있어요. 잠시 후 다시 시도해 주세요';
  end if;
  insert into public.applications(nickname, server, cls, cp, inputs, verify_code, shot_path, token_hash)
  values (v_n, '', left(coalesce(p_cls, ''), 40), p_cp, coalesce(p_inputs, '{}'::jsonb),
          left(coalesce(p_code, ''), 20), left(p_shot, 200), encode(digest(p_token, 'sha256'), 'hex'))
  returning id into v_id;
  return v_id;
end $$;
