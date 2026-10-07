import type * as NotificationTypes from "expo-notifications";
import { isRunningInExpoGo } from "expo";
import { Linking, Platform } from "react-native";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  loadReminderSettings,
  saveReminderSettings,
} from "../database/repositories/reminderRepository";
import type {
  FinanceReminderSettings,
  NotificationPermissionState,
  ReminderState,
} from "../types/reminder";
export const reminderIdentifier = "daily-finance-reminder";
export const reminderChannel = "finance-reminders-silent-v2";
const legacyReminderChannel = "finance-reminders";
const title = "Daily Finance Check";
const body = "Don't forget to register today's expenses and income.";
let queue: Promise<unknown> = Promise.resolve();
// Serialize startup, foreground refresh and settings changes to avoid racing schedules.
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.catch(() => undefined);
  return result;
}
export function getNotificationAvailabilityMessage(): string | null {
  if (Platform.OS === "web") return "Notifications require Android or iOS.";
  if (Platform.OS === "android" && isRunningInExpoGo())
    return "Daily reminders require an Android development or installed app build with this Expo version. Finance features remain available in Expo Go.";
  return null;
}
let notificationModule: Promise<typeof NotificationTypes> | null = null;
async function getNotifications(): Promise<typeof NotificationTypes> {
  const unavailable = getNotificationAvailabilityMessage();
  if (unavailable) throw new Error(unavailable);
  // SDK 57's public entry point initializes push-token listeners even for local
  // reminders. Never evaluate it in Android Expo Go, or during route imports.
  notificationModule ??= import("expo-notifications")
    .then((module) => {
      module.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      return module;
    })
    .catch((error) => {
      notificationModule = null;
      throw error;
    });
  return notificationModule;
}
async function createChannel() {
  const Notifications = await getNotifications();
  if (Platform.OS === "android") {
    // Android restores a deleted channel's immutable sound settings when the
    // same ID is recreated. Migrate once to a new silent ID instead.
    const legacy = await Notifications.getNotificationChannelAsync(
      legacyReminderChannel,
    );
    const current =
      await Notifications.getNotificationChannelAsync(reminderChannel);
    await Notifications.setNotificationChannelAsync(reminderChannel, {
      name: "Finance Reminders",
      importance:
        !current && legacy?.importance === Notifications.AndroidImportance.NONE
          ? Notifications.AndroidImportance.NONE
          : Notifications.AndroidImportance.DEFAULT,
      sound: null,
      enableVibrate: false,
    });
    if (legacy)
      await Notifications.deleteNotificationChannelAsync(legacyReminderChannel);
  }
}
export async function getNotificationPermissionStatus(): Promise<NotificationPermissionState> {
  if (getNotificationAvailabilityMessage()) return "unavailable";
  const Notifications = await getNotifications();
  const permission = await Notifications.getPermissionsAsync();
  if (Platform.OS === "android" && permission.granted) {
    const channel =
      await Notifications.getNotificationChannelAsync(reminderChannel);
    if (channel?.importance === Notifications.AndroidImportance.NONE)
      return "denied";
  }
  return permission.granted ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    ? "granted"
    : permission.status;
}
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (getNotificationAvailabilityMessage()) return "unavailable";
  const Notifications = await getNotifications();
  await createChannel();
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status === "undetermined" && permission.canAskAgain)
    await Notifications.requestPermissionsAsync();
  return getNotificationPermissionStatus();
}
function isFinanceReminder(request: NotificationTypes.NotificationRequest) {
  return (
    request.identifier === reminderIdentifier ||
    request.content.data?.kind === reminderIdentifier
  );
}
function matches(
  request: NotificationTypes.NotificationRequest,
  settings: FinanceReminderSettings,
) {
  const trigger = request.trigger;
  if (
    !trigger ||
    !("type" in trigger) ||
    request.content.title !== title ||
    request.content.body !== body
  )
    return false;
  if (request.content.sound) return false;
  if (
    Platform.OS === "android" &&
    (!("channelId" in trigger) || trigger.channelId !== reminderChannel)
  )
    return false;
  if (trigger.type === "daily")
    return trigger.hour === settings.hour && trigger.minute === settings.minute;
  if (trigger.type === "calendar") {
    // Native iOS responses carry dateComponents; SDK 57's request union also
    // permits the input representation with hour/minute at the top level.
    if ("dateComponents" in trigger) {
      const components = trigger.dateComponents;
      return (
        trigger.repeats &&
        typeof components === "object" &&
        components !== null &&
        "hour" in components &&
        "minute" in components &&
        components.hour === settings.hour &&
        components.minute === settings.minute
      );
    }
    return (
      trigger.repeats === true &&
      trigger.hour === settings.hour &&
      trigger.minute === settings.minute
    );
  }
  return false;
}
async function cancelExisting() {
  const Notifications = await getNotifications();
  for (const request of (
    await Notifications.getAllScheduledNotificationsAsync()
  ).filter(isFinanceReminder))
    await Notifications.cancelScheduledNotificationAsync(request.identifier);
}
async function reconcile(
  settings: FinanceReminderSettings,
  prompt: boolean,
): Promise<ReminderState> {
  const state: ReminderState = {
    settings,
    permission: "unavailable",
    status: "Error",
    scheduledCount: null,
    error: null,
  };
  const unavailable = getNotificationAvailabilityMessage();
  if (unavailable)
    return { ...state, status: "Unavailable", error: unavailable };
  try {
    const Notifications = await getNotifications();
    await createChannel();
    state.permission =
      prompt && settings.enabled
        ? await requestNotificationPermission()
        : await getNotificationPermissionStatus();
    let requests = (
      await Notifications.getAllScheduledNotificationsAsync()
    ).filter(isFinanceReminder);
    if (!settings.enabled || state.permission !== "granted") {
      await cancelExisting();
      state.status = settings.enabled ? "Permission Required" : "Disabled";
    } else {
      if (requests.length !== 1 || !matches(requests[0], settings)) {
        await cancelExisting();
        await Notifications.scheduleNotificationAsync({
          identifier: reminderIdentifier,
          content: {
            title,
            body,
            sound: false,
            vibrate: [],
            data: { kind: reminderIdentifier },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: settings.hour,
            minute: settings.minute,
            channelId: reminderChannel,
          },
        });
      }
      state.status = "Scheduled";
    }
    requests = (await Notifications.getAllScheduledNotificationsAsync()).filter(
      isFinanceReminder,
    );
    state.scheduledCount = requests.length;
    if (
      requests.length !== (state.status === "Scheduled" ? 1 : 0) ||
      (state.status === "Scheduled" && !matches(requests[0], settings))
    )
      throw new Error("Schedule verification failed");
  } catch (error) {
    state.status = "Error";
    state.error =
      Platform.OS === "web"
        ? "Notifications require Android or iOS."
        : "Unable to schedule reminder. Please retry.";
    if (__DEV__)
      console.warn(
        "Finance reminder",
        error instanceof Error ? error.name : "UnknownError",
      );
  }
  return state;
}
export function initializeNotifications(db: SQLiteDatabase, prompt = false) {
  return serialize(async () =>
    reconcile(await loadReminderSettings(db), prompt),
  );
}
export function rescheduleDailyFinanceReminder(
  db: SQLiteDatabase,
  settings: FinanceReminderSettings,
) {
  return serialize(async () => {
    await saveReminderSettings(db, settings);
    return reconcile(settings, settings.enabled);
  });
}
export function cancelDailyFinanceReminder(db: SQLiteDatabase) {
  return serialize(async () => {
    const settings = { ...(await loadReminderSettings(db)), enabled: false };
    await saveReminderSettings(db, settings);
    return reconcile(settings, false);
  });
}
export function sendTestNotification() {
  return serialize(async () => {
    const unavailable = getNotificationAvailabilityMessage();
    if (unavailable) throw new Error(unavailable);
    const Notifications = await getNotifications();
    if ((await requestNotificationPermission()) !== "granted")
      throw new Error("Enable notifications in system settings first.");
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Finance Reminder Test",
        body: "Notifications are working correctly.",
        sound: false,
        vibrate: [],
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 3,
        channelId: reminderChannel,
      },
    });
  });
}
export const openNotificationSettings = () => Linking.openSettings();
