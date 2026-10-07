const { test } = require("node:test");
const assert = require("node:assert/strict");
const { database } = require("./helpers.cjs");
const Module = require("node:module");
let permission = "undetermined";
let requests = [];
let prompts = 0;
let schedules = 0;
let fail = false;
const channels = [];
const channelState = new Map([
  [
    "finance-reminders",
    { importance: 3, sound: "default", enableVibrate: false },
  ],
]);
const deletedChannels = [];
let handler;
const notifications = {
  SchedulableTriggerInputTypes: {
    DAILY: "daily",
    TIME_INTERVAL: "timeInterval",
  },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  AndroidImportance: { DEFAULT: 3, NONE: 0 },
  setNotificationHandler: (value) => {
    handler = value;
  },
  setNotificationChannelAsync: async (id, config) => {
    channels.push({ id, ...config });
    if (!channelState.has(id)) channelState.set(id, config);
  },
  getNotificationChannelAsync: async (id) => channelState.get(id) ?? null,
  deleteNotificationChannelAsync: async (id) => {
    deletedChannels.push(id);
    channelState.delete(id);
  },
  getPermissionsAsync: async () => ({
    status: permission,
    granted: permission === "granted",
    canAskAgain: true,
  }),
  requestPermissionsAsync: async () => {
    prompts++;
    permission = "granted";
  },
  getAllScheduledNotificationsAsync: async () => [...requests],
  cancelScheduledNotificationAsync: async (id) => {
    requests = requests.filter((r) => r.identifier !== id);
  },
  scheduleNotificationAsync: async (request) => {
    if (fail) throw new Error("Native failure");
    schedules++;
    requests.push({ ...request, identifier: request.identifier ?? "test" });
    return request.identifier ?? "test";
  },
};
const original = Module._load;
Module._load = function (name, ...args) {
  if (name === "expo") return { isRunningInExpoGo: () => false };
  if (name === "expo-notifications") return notifications;
  if (name === "react-native")
    return {
      Platform: { OS: "android" },
      Linking: { openSettings: async () => {} },
    };
  return original.call(this, name, ...args);
};
const service = require("../services/notifications.ts");
const { initializeDatabase } = require("../database/database.ts");
const {
  loadReminderSettings,
} = require("../database/repositories/reminderRepository.ts");
test("reminder permission, concurrency, transitions, restart, failure and test notification", async () => {
  const db = database();
  try {
    await initializeDatabase(db.adapter);
    let state = await service.initializeNotifications(db.adapter);
    assert.equal(state.status, "Permission Required");
    assert.equal(prompts, 0);
    assert.deepEqual(state.settings, { enabled: true, hour: 22, minute: 0 });
    state = await service.initializeNotifications(db.adapter, true);
    assert.equal(state.status, "Scheduled");
    assert.equal(prompts, 1);
    assert.equal(channels[0].id, service.reminderChannel);
    assert.equal(channels[0].importance, 3);
    assert.equal(channels[0].sound, null);
    assert.equal(channels[0].enableVibrate, false);
    assert.deepEqual(deletedChannels, ["finance-reminders"]);
    assert.equal(channelState.size, 1);
    assert.equal(requests[0].content.sound, false);
    assert.deepEqual(requests[0].content.vibrate, []);
    assert.equal(requests[0].trigger.channelId, service.reminderChannel);
    assert.deepEqual(await handler.handleNotification(), {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
    await Promise.all(
      Array.from({ length: 10 }, () =>
        service.initializeNotifications(db.adapter, true),
      ),
    );
    assert.equal(requests.length, 1);
    assert.equal(schedules, 1);
    requests.push({ ...requests[0], identifier: "legacy-duplicate" });
    state = await service.rescheduleDailyFinanceReminder(db.adapter, {
      enabled: true,
      hour: 22,
      minute: 5,
    });
    assert.equal(state.scheduledCount, 1);
    assert.equal(requests[0].trigger.minute, 5);
    await service.cancelDailyFinanceReminder(db.adapter);
    assert.equal(requests.length, 0);
    db.restart();
    assert.deepEqual(await loadReminderSettings(db.adapter), {
      enabled: false,
      hour: 22,
      minute: 5,
    });
    state = await service.initializeNotifications(db.adapter);
    assert.equal(state.status, "Disabled");
    state = await service.rescheduleDailyFinanceReminder(db.adapter, {
      enabled: true,
      hour: 22,
      minute: 5,
    });
    assert.equal(state.scheduledCount, 1);
    permission = "denied";
    state = await service.initializeNotifications(db.adapter, true);
    assert.equal(state.status, "Permission Required");
    assert.equal(requests.length, 0);
    assert.equal(prompts, 1);
    await assert.rejects(
      service.sendTestNotification(),
      /Enable notifications/,
    );
    permission = "granted";
    fail = true;
    state = await service.initializeNotifications(db.adapter);
    assert.equal(state.status, "Error");
    fail = false;
    state = await service.initializeNotifications(db.adapter);
    assert.equal(state.scheduledCount, 1);
    await service.sendTestNotification();
    assert.equal(
      requests.filter((r) => r.content.title === "Finance Reminder Test")
        .length,
      1,
    );
    assert.equal(
      requests.find((r) => r.identifier === "test").trigger.seconds,
      3,
    );
    assert.equal(
      requests.find((r) => r.identifier === "test").content.sound,
      false,
    );
    assert.deepEqual(
      requests.find((r) => r.identifier === "test").content.vibrate,
      [],
    );
    await service.cancelDailyFinanceReminder(db.adapter);
    assert.equal(requests.length, 1, "unrelated test schedule preserved");
  } finally {
    db.sqlite.close();
  }
});
test("existing audible reminder migrates once with the same ID/time, and blocked legacy channel remains blocked", async () => {
  const db = database();
  try {
    await initializeDatabase(db.adapter);
    permission = "granted";
    requests = [];
    channelState.clear();
    channelState.set("finance-reminders", { importance: 3, sound: "default" });
    requests.push({
      identifier: service.reminderIdentifier,
      content: {
        title: "Daily Finance Check",
        body: "Don't forget to register today's expenses and income.",
        sound: "default",
        data: { kind: service.reminderIdentifier },
      },
      trigger: {
        type: "daily",
        hour: 22,
        minute: 0,
        channelId: "finance-reminders",
      },
    });
    const before = schedules;
    let state = await service.initializeNotifications(db.adapter);
    assert.equal(state.status, "Scheduled");
    assert.equal(schedules, before + 1);
    assert.equal(requests[0].identifier, service.reminderIdentifier);
    assert.equal(requests[0].trigger.hour, 22);
    assert.equal(requests[0].trigger.minute, 0);
    assert.equal(requests[0].trigger.channelId, service.reminderChannel);
    assert.equal(requests[0].content.sound, false);
    assert.deepEqual(requests[0].content.vibrate, []);
    await service.initializeNotifications(db.adapter);
    assert.equal(schedules, before + 1);
    assert.equal(channelState.size, 1);
    channelState.clear();
    channelState.set("finance-reminders", { importance: 0, sound: "default" });
    state = await service.initializeNotifications(db.adapter);
    assert.equal(state.permission, "denied");
    assert.equal(state.status, "Permission Required");
    assert.equal(requests.length, 0);
    assert.equal(channelState.get(service.reminderChannel).importance, 0);
  } finally {
    db.sqlite.close();
  }
});
