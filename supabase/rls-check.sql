-- Dashboard SQL Editor acceptance check. Replace the three UUID placeholders with
-- two real Auth user IDs and an account UUID belonging ONLY to user A.
-- Run after A has synced. This transaction always rolls back its test writes.
begin;
select set_config('finance.test_user_a', 'REPLACE_WITH_USER_A_UUID', true);
select set_config('finance.test_user_b', 'REPLACE_WITH_USER_B_UUID', true);
select set_config('finance.test_account_a', 'REPLACE_WITH_ACCOUNT_A_UUID', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('finance.test_user_b'), true);
select set_config('request.jwt.claims', json_build_object('sub',current_setting('finance.test_user_b'),'role','authenticated')::text, true);
do $$
declare
  table_name text;
  touched integer;
begin
  foreach table_name in array array['accounts','categories','transactions'] loop
    execute format('select count(*) from public.%I where user_id=$1',table_name)
      into touched using current_setting('finance.test_user_a')::uuid;
    if touched <> 0 then raise exception 'RLS SELECT failed for %',table_name; end if;
    execute format('update public.%I set updated_at=now() where user_id=$1',table_name)
      using current_setting('finance.test_user_a')::uuid;
    get diagnostics touched = row_count;
    if touched <> 0 then raise exception 'RLS UPDATE failed for %',table_name; end if;
  end loop;
  begin
    insert into public.accounts(user_id,id,name,type,initial_balance_cents,created_at)
      values(current_setting('finance.test_user_a')::uuid,gen_random_uuid(),'Spoof','cash',0,now());
    raise exception 'RLS INSERT spoof succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.transactions(user_id,id,account_id,type,amount_cents,description,transaction_date,is_balance_adjustment,created_at)
      values(current_setting('finance.test_user_b')::uuid,gen_random_uuid(),current_setting('finance.test_account_a')::uuid,'income',1,'Cross-owner FK test',current_date,true,now());
    raise exception 'Cross-owner reference succeeded';
  exception when foreign_key_violation then null;
  end;
  begin
    delete from public.accounts;
    raise exception 'Physical DELETE unexpectedly permitted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
-- Expected: completes with ROLLBACK; no custom exception. The Dashboard's normal
-- postgres role bypasses RLS, so SELECTs without SET LOCAL ROLE do not test it.
