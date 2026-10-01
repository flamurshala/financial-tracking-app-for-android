export interface FinanceReminderSettings { enabled: boolean; hour: number; minute: number }
export type NotificationPermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';
export interface ReminderState {
  settings: FinanceReminderSettings;
  permission: NotificationPermissionState;
  status: 'Scheduled' | 'Disabled' | 'Permission Required' | 'Error' | 'Unavailable';
  scheduledCount: number | null;
  error: string | null;
}
