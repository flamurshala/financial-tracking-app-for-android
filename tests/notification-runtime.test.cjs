const { test } = require('node:test');
const assert = require('node:assert/strict');
const { database } = require('./helpers.cjs');
const Module = require('node:module');
let expoGo = true;
let platform = 'android';
let moduleLoads = 0;
const original = Module._load;
Module._load = function(name, ...args) {
  if (name === 'expo') return { isRunningInExpoGo: () => expoGo };
  if (name === 'react-native') return { Platform: { get OS() { return platform; } }, Linking: { openSettings: async () => {} } };
  if (name === 'expo-notifications') {
    moduleLoads++;
    throw new Error('Simulated native notification module import failure');
  }
  return original.call(this,name,...args);
};
const service = require('../services/notifications.ts');
const { initializeDatabase } = require('../database/database.ts');
const { loadReminderSettings } = require('../database/repositories/reminderRepository.ts');
test('Android Expo Go never evaluates notifications while routes import the service or reminder settings change', async () => {
  const file = database();
  try {
    assert.equal(moduleLoads,0,'route imports must be safe');
    await initializeDatabase(file.adapter);
    const state = await service.initializeNotifications(file.adapter,true);
    assert.equal(state.status,'Unavailable');
    assert.equal(state.permission,'unavailable');
    assert.equal(state.scheduledCount,null,'do not claim native schedule verification');
    assert.match(state.error,/development/);
    assert.equal(await service.requestNotificationPermission(),'unavailable');
    assert.equal(await service.getNotificationPermissionStatus(),'unavailable');
    await service.rescheduleDailyFinanceReminder(file.adapter,{ enabled:true,hour:21,minute:30 });
    file.restart();
    assert.deepEqual(await loadReminderSettings(file.adapter),{ enabled:true,hour:21,minute:30 });
    await service.cancelDailyFinanceReminder(file.adapter);
    assert.equal((await loadReminderSettings(file.adapter)).enabled,false);
    await assert.rejects(service.sendTestNotification(),/development/);
    assert.equal(moduleLoads,0);
    platform='web';
    assert.equal((await service.initializeNotifications(file.adapter)).status,'Unavailable');
    assert.equal(moduleLoads,0);
  } finally { platform='android';file.sqlite.close(); }
});
test('native import failure is contained in reminder status and can be retried', async () => {
  const file = database();
  try {
    expoGo=false;
    await initializeDatabase(file.adapter);
    const state = await service.initializeNotifications(file.adapter);
    assert.equal(state.status,'Error');
    assert.match(state.error,/Unable to schedule/);
    assert.equal(moduleLoads,1);
    await service.initializeNotifications(file.adapter);
    assert.equal(moduleLoads,2,'failed loader must permit a later retry');
  } finally { file.sqlite.close(); }
});
