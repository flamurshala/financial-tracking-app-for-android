const assert=require('node:assert/strict');
const {test}=require('node:test');
const {database}=require('./helpers.cjs');
const {migrations}=require('../database/migrations/index.ts');
const {initializeDatabase}=require('../database/database.ts');
for(const version of [1,2,3,4]) test(`upgrade every historical schema: version ${version} preserves metadata and finances`,async()=>{
  const {sqlite,adapter:db}=database();
  try {
    await db.execAsync('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)');
    for(const migration of migrations.slice(0,version)){await migration.up(db);await db.runAsync('INSERT INTO schema_migrations VALUES(?,?,?)',migration.version,migration.name,'2026-10-01T00:00:00Z');}
    await db.runAsync("INSERT INTO app_metadata VALUES('preserve_me','Çaj')");
    if(version>=2)await db.runAsync("INSERT INTO accounts(id,name,type,currency,initial_balance_cents,is_archived,created_at,updated_at,deleted_at,sync_status) VALUES ('00000000-0000-4000-8000-000000000099','Existing Cash','cash','EUR',50000,0,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z',NULL,'pending')");
    await initializeDatabase(db);await initializeDatabase(db);
    assert.equal((await db.getFirstAsync("SELECT value FROM app_metadata WHERE key='preserve_me'")).value,'Çaj');
    assert.equal((await db.getFirstAsync('SELECT MAX(version) AS version FROM schema_migrations')).version,5);
    if(version>=2)assert.equal((await db.getFirstAsync("SELECT initial_balance_cents FROM accounts WHERE name='Existing Cash'")).initial_balance_cents,50000);
  }finally{sqlite.close();}
});
