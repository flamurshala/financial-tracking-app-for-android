const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const userA = '10000000-0000-4000-8000-000000000001';
const userB = '10000000-0000-4000-8000-000000000002';
const account = '20000000-0000-4000-8000-000000000001';
test('actual PostgreSQL schema: RLS ownership, composite FK, money constraints, server stamps and DELETE denial', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
      INSERT INTO auth.users VALUES ('${userA}'), ('${userB}');`);
    await pg.exec(fs.readFileSync('supabase/schema.sql', 'utf8'));
    await pg.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${userA}',false);`);
    await pg.query('INSERT INTO public.accounts(user_id,id,name,type,initial_balance_cents,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [userA,account,'Cash','cash',10000,'2026-10-01T00:00:00Z']);
    const first = (await pg.query('SELECT * FROM accounts')).rows[0];
    assert.equal(first.user_id, userA);
    assert.equal(Number(first.sync_version), 1);
    await pg.query('UPDATE accounts SET name=$1,updated_at=$2,sync_version=$3 WHERE id=$4', ['Edited','2000-01-01T00:00:00Z',999,account]);
    const updated = (await pg.query('SELECT * FROM accounts')).rows[0];
    assert.equal(Number(updated.sync_version), 2);
    assert.notEqual(new Date(updated.updated_at).getUTCFullYear(), 2000);
    const category = '40000000-0000-4000-8000-000000000001';
    await pg.query('INSERT INTO categories(user_id,id,name,type,created_at) VALUES ($1,$2,$3,$4,now())', [userA,category,'Coffee','expense']);
    await pg.query('INSERT INTO transactions(user_id,id,account_id,category_id,type,amount_cents,description,transaction_date,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())', [userA,account,account,category,'expense',100,'Coffee','2026-10-01']);
    await assert.rejects(pg.query('INSERT INTO accounts(user_id,id,name,type,initial_balance_cents,created_at) VALUES ($1,$2,$3,$4,$5,now())', [userB,account,'Spoof','cash',0]), /Unauthorized|row-level security/);
    await pg.exec(`SELECT set_config('request.jwt.claim.sub','${userB}',false);`);
    assert.equal((await pg.query('SELECT * FROM accounts')).rows.length, 0);
    for (const table of ['categories','transactions']) {
      assert.equal((await pg.query(`SELECT * FROM ${table}`)).rows.length, 0);
      assert.equal((await pg.query(`UPDATE ${table} SET updated_at=now() WHERE user_id=$1 RETURNING id`, [userA])).rows.length, 0);
    }
    await assert.rejects(pg.query('INSERT INTO categories(user_id,id,name,type,created_at) VALUES($1,$2,$3,$4,now())', [userA,account,'Spoof','expense']), /Unauthorized|row-level security/);
    await assert.rejects(pg.query('INSERT INTO transactions(user_id,id,account_id,category_id,type,amount_cents,description,transaction_date,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())', [userA,category,account,category,'expense',100,'Spoof','2026-10-01']), /Unauthorized|row-level security/);
    assert.equal((await pg.query('UPDATE accounts SET name=$1 WHERE user_id=$2 RETURNING id', ['Hacked',userA])).rows.length, 0);
    await pg.query('INSERT INTO accounts(user_id,id,name,type,initial_balance_cents,created_at) VALUES ($1,$2,$3,$4,$5,now())', [userB,account,'B Cash','cash',0]);
    await assert.rejects(pg.query('INSERT INTO transactions(user_id,id,account_id,type,amount_cents,description,transaction_date,is_balance_adjustment,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,true,now())', [userB,account,'30000000-0000-4000-8000-000000000001','income',100,'Adjustment','2026-10-01']), /foreign key/);
    await assert.rejects(pg.query('UPDATE accounts SET user_id=$1', [userA]), /immutable|row-level security|Unauthorized/);
    await assert.rejects(pg.query('DELETE FROM accounts'), /permission denied/);
    assert.equal(Number((await pg.query('SELECT finance_sync_cursor() AS cursor')).rows[0].cursor), 1);
    await assert.rejects(pg.query('UPDATE accounts SET initial_balance_cents=9007199254740992'), /check constraint/);
    assert.equal(Number((await pg.query('SELECT finance_sync_cursor() AS cursor')).rows[0].cursor), 1, 'failed writes do not publish cursor changes');
    await assert.rejects(pg.query('SELECT * FROM finance_sync_heads'), /permission denied/);
    const onlyA = '20000000-0000-4000-8000-000000000099';
    await pg.exec(`SELECT set_config('request.jwt.claim.sub','${userA}',false);`);
    await pg.query('INSERT INTO accounts(user_id,id,name,type,initial_balance_cents,created_at) VALUES ($1,$2,$3,$4,$5,now())', [userA,onlyA,'Only A','cash',0]);
    await pg.exec('RESET ROLE;');
    const acceptance = fs.readFileSync('supabase/rls-check.sql','utf8').replace('REPLACE_WITH_USER_A_UUID',userA).replace('REPLACE_WITH_USER_B_UUID',userB).replace('REPLACE_WITH_ACCOUNT_A_UUID',onlyA);
    await pg.exec(acceptance);
    await pg.exec('RESET ROLE; SET ROLE anon;');
    await assert.rejects(pg.query('SELECT * FROM accounts'), /permission denied/);
    await assert.rejects(pg.query('SELECT finance_sync_cursor()'), /permission denied/);
  } finally { await pg.close(); }
});
