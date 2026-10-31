const {test}=require('node:test');
const assert=require('node:assert/strict');
const {database}=require('./helpers.cjs');
const {initializeDatabase}=require('../database/database.ts');
const a=require('../database/repositories/accountRepository.ts');
const c=require('../database/repositories/categoryRepository.ts');
const t=require('../database/repositories/transactionRepository.ts');
const x=require('../database/repositories/transferRepository.ts');
const {getAccountBalances}=require('../database/repositories/financeReadRepository.ts');
const {getCategoryExpenseBreakdown}=require('../database/repositories/statisticsRepository.ts');
const {writeTransfersCsv,writeJsonBackup}=require('../database/repositories/exportRepository.ts');
const {adjustAccountBalance}=require('../services/finance.ts');
async function account(db,name,initial){return a.createAccount(db,{name,type:'bank',initial_balance_cents:initial});}
const date='2026-10-31';
test('transfer lifecycle: derived balances, conserved wealth, statistics, validation, archives, export and offline restart',async()=>{
 const f=database();
 try{
  await initializeDatabase(f.adapter);let db=f.adapter;
  const bank=await account(db,'Bank',100000),cash=await account(db,'Cash',20000),card=await account(db,'Card',0);
  const input={from_account_id:bank.id,to_account_id:cash.id,amount_cents:10000,transfer_date:date,note:'ATM withdrawal'};
  const transfer=await x.saveTransfer(db,input);
  async function balances(expected){assert.deepEqual(await Promise.all([bank,cash,card].map(r=>a.getAccountBalance(f.adapter,r.id))),expected);assert.equal(await a.getCombinedBalance(f.adapter),120000);assert.equal((await getAccountBalances(f.adapter)).reduce((n,r)=>n+r.balance_cents,0),120000);assert.equal(await t.getTotalIncome(f.adapter),0);assert.equal(await t.getTotalExpenses(f.adapter),0);}
  await balances([90000,30000,0]);
  f.restart();db=f.adapter;await initializeDatabase(db);await balances([90000,30000,0]);
  await x.saveTransfer(db,{...input,amount_cents:15000},transfer.id);await balances([85000,35000,0]);
  await x.saveTransfer(db,{...input,to_account_id:card.id,amount_cents:15000},transfer.id);await balances([85000,20000,15000]);
  let csv='';await writeTransfersCsv(db,s=>{csv+=s;});assert.match(csv,/Transfer/);assert.match(csv,/Bank/);assert.match(csv,/150.00/);
  let json='';await writeJsonBackup(db,s=>{json+=s;});assert.equal(JSON.parse(json).transfers.length,1);
  await x.deleteTransfer(db,transfer.id);await balances([100000,20000,0]);
  for(const patch of [{amount_cents:0},{amount_cents:1.1},{amount_cents:-1},{amount_cents:NaN},{amount_cents:Number.MAX_SAFE_INTEGER+1},{transfer_date:'2026-02-30'},{to_account_id:bank.id}])await assert.rejects(x.saveTransfer(db,{...input,...patch}));
  await a.archiveAccount(db,cash.id);await assert.rejects(x.saveTransfer(db,input),/active/);await a.restoreAccount(db,cash.id);
  const negative=await x.saveTransfer(db,{...input,amount_cents:110000});assert.equal(await a.getAccountBalance(db,bank.id),-10000);
  await adjustAccountBalance(db,bank.id,0,date);assert.equal(await a.getAccountBalance(db,bank.id),0);assert.equal(await t.getTotalIncome(db),0);
  await a.archiveAccount(db,cash.id);assert.equal((await x.getTransferHistory(db))[0].to_account_name,'Cash');await x.deleteTransfer(db,negative.id);
  assert.deepEqual(await db.getAllAsync('PRAGMA foreign_key_check'),[]);
  assert.equal((await db.getFirstAsync("SELECT COUNT(*) AS n FROM transfers WHERE typeof(amount_cents)<>'integer'")).n,0);
 }finally{f.sqlite.close();}
});
test('category deletion: 50 entries plus deleted history, rollback, descriptions, statistics, types and seeds',async()=>{
 const f=database();try{
  await initializeDatabase(f.adapter);const db=f.adapter;
  const acc=await account(db,'Cash',10000);
  const coffee=(await c.getExpenseCategories(db)).find(r=>r.name==='Coffee');
  const drinks=await c.createCategory(db,{name:'Replacement',type:'expense'});
  for(let i=0;i<50;i++)await t.createTransaction(db,{account_id:acc.id,category_id:coffee.id,type:'expense',amount_cents:100,description:'Coffee with Elona',transaction_date:date});
  const deleted=await t.createTransaction(db,{account_id:acc.id,category_id:coffee.id,type:'expense',amount_cents:100,description:'Deleted history',transaction_date:date});await t.softDeleteTransaction(db,deleted.id);
  const plan=await c.getCategoryDeletionPlan(db,coffee.id);assert.equal(plan.transactionCount,51);assert.ok(plan.replacements.some(r=>r.id===drinks.id));
  await assert.rejects(c.deleteCategory(db,coffee.id,coffee.id));
  await db.execAsync("CREATE TRIGGER fail_delete BEFORE UPDATE OF deleted_at ON categories BEGIN SELECT RAISE(ABORT,'simulated failure'); END;");
  await assert.rejects(c.deleteCategory(db,coffee.id,drinks.id),/simulated/);assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM transactions WHERE category_id=?',coffee.id)).n,51);
  await db.execAsync('DROP TRIGGER fail_delete');
  assert.equal((await c.deleteCategory(db,coffee.id,drinks.id)).moved,51);
  assert.equal(await c.getCategoryById(db,coffee.id),null);
  const rows=await db.getAllAsync('SELECT * FROM transactions');assert.equal(rows.length,51);assert.ok(rows.every(r=>r.category_id===drinks.id && r.sync_status==='pending'));assert.equal(rows.filter(r=>r.description==='Coffee with Elona').length,50);assert.ok(rows.find(r=>r.id===deleted.id).deleted_at);
  const stats=await getCategoryExpenseBreakdown(db,{fromDate:date,toDate:date});assert.equal(stats.find(r=>r.categoryId===drinks.id).cents,5000);
  f.restart();await initializeDatabase(f.adapter);assert.equal(await c.getCategoryById(f.adapter,coffee.id),null);
  const zero=await c.createCategory(f.adapter,{name:'Zero',type:'both'});await c.deleteCategory(f.adapter,zero.id);assert.equal(await c.getCategoryById(f.adapter,zero.id),null);
  assert.deepEqual(await f.adapter.getAllAsync('PRAGMA foreign_key_check'),[]);
 }finally{f.sqlite.close();}
});
test('mixed types and last replacement require compatible category; duplicate names use IDs',async()=>{
 const f=database();try{await initializeDatabase(f.adapter);const db=f.adapter;
 const acc=await account(db,'Cash',0),mixed=await c.createCategory(db,{name:'Same',type:'both'}),replacement=await c.createCategory(db,{name:'Same',type:'expense'});
 for(const type of ['expense','income'])await t.createTransaction(db,{account_id:acc.id,category_id:mixed.id,type,amount_cents:1,description:'History',transaction_date:date});
 assert.equal((await c.getCategoryDeletionPlan(db,mixed.id)).replacements.length,0);await assert.rejects(c.deleteCategory(db,mixed.id,replacement.id),/compatible/);
 const both=await c.createCategory(db,{name:'Same',type:'both'});await c.deleteCategory(db,mixed.id,both.id);assert.ok((await db.getAllAsync('SELECT * FROM transactions')).every(r=>r.category_id===both.id));
 }finally{f.sqlite.close();}
});
