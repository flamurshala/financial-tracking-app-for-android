import * as Notifications from 'expo-notifications';
export async function getNotificationPermission() { return Notifications.getPermissionsAsync(); }
// Permission requests and scheduling will be added with the reminder feature.
