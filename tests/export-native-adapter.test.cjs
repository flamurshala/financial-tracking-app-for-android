const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const { database } = require('./helpers.cjs');
const { initializeDatabase } = require('../database/database.ts');
const { createAccount } = require('../database/repositories/accountRepository.ts');
const files = new Map();
let failOpen = false, shared = 0, closed = 0;
const state = {ready:true,locked:false,backgrounded:false};
const appState = {currentState:'active'};
class Directory {
  constructor(...parts) {this.uri=parts.map(x=>x.uri??x).join('/');}
  create() {}
  list() {return [...files.values()];}
}
class File {
  constructor(root,name) {this.uri=`${root.uri}/${name}`;this.content='';this.modificationTime=Date.now();}
  get exists() {return files.has(this.uri);}
  create() {files.set(this.uri,this);}
  delete() {files.delete(this.uri);}
  open() {if(failOpen)throw new Error('private native path');return {writeBytes:bytes=>{this.content+=new TextDecoder().decode(bytes);},close:()=>{closed++;}};}
}
const original = Module._load;
Module._load = function(request,parent,isMain) {
  if(request==='expo-file-system')return {Directory,File,FileMode:{WriteOnly:'w'},Paths:{cache:'private-cache'}};
  if(request==='expo-sharing')return {isAvailableAsync:async()=>true,shareAsync:async(uri,options)=>{assert.equal(closed>0,true);assert.equal(files.get(uri).exists,true);assert.equal(options.mimeType,'application/json');shared++;}};
  if(request==='react-native')return {AppState:appState};
  if(request==='./appLock' && parent.filename.endsWith('exports.ts'))return {appLock:{getSnapshot:()=>state}};
  return original.call(this,request,parent,isMain);
};
const {shareFinanceExport}=require('../services/exports.ts');
test('native export adapter closes UTF-8 file before sharing, retains completed copy, cleans failed files and blocks locked export',async()=>{
  const {sqlite,adapter:db}=database();
  try {
    await initializeDatabase(db);await createAccount(db,{name:'Çaj',type:'cash',initial_balance_cents:500});
    await shareFinanceExport(db,'json',{},'backup/../../name',()=>{},()=>false);
    assert.equal(shared,1);assert.equal(files.size,1);assert.equal(JSON.parse([...files.values()][0].content).accounts[0].name,'Çaj');
    assert.ok([...files.keys()][0].startsWith('private-cache/finance-exports/finance_backup_______name'));
    failOpen=true;await assert.rejects(()=>shareFinanceExport(db,'json',{},'failure',()=>{},()=>false),/Unable to create export file/);assert.equal(files.size,1);assert.equal(shared,1);
    failOpen=false;state.locked=true;await assert.rejects(()=>shareFinanceExport(db,'json',{},'locked',()=>{},()=>false),/Export interrupted/);assert.equal(files.size,1);
    state.locked=false;appState.currentState='background';await assert.rejects(()=>shareFinanceExport(db,'json',{},'background',()=>{},()=>false),/Export interrupted/);assert.equal(shared,1);
  } finally {sqlite.close();}
});
