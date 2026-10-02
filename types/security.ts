export type LockTimeout = 0 | 60000 | 300000 | 900000;
export interface AppLockSettings {
  enabled: boolean;
  timeout: LockTimeout;
}
export interface BiometricStatus {
  hasHardware: boolean;
  enrolled: boolean;
  types: string[];
}
export interface SecurityState {
  hasUnlocked: boolean;
  ready: boolean;
  locked: boolean;
  busy: boolean;
  settings: AppLockSettings;
  error: string | null;
  backgrounded: boolean;
}
export interface AuthenticationResult {
  success: boolean;
  message?: string;
}
export interface SecurityDependencies {
  load: () => Promise<AppLockSettings>;
  save: (settings: AppLockSettings) => Promise<void>;
  capability: () => Promise<BiometricStatus>;
  authenticate: (biometricOnly?: boolean) => Promise<AuthenticationResult>;
  now: () => number;
}
export const lockTimeouts: { value: LockTimeout; label: string }[] = [
  { value: 0, label: "Immediately" },
  { value: 60000, label: "After 1 minute" },
  { value: 300000, label: "After 5 minutes" },
  { value: 900000, label: "After 15 minutes" },
];
