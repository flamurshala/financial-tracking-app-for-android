import type {
  SecurityDependencies,
  SecurityState,
  LockTimeout,
} from "../../types/security";
export function shouldLockOnForeground(
  start: number | null,
  now: number,
  timeout: LockTimeout,
) {
  return start !== null && (now < start || now - start >= timeout);
}
/** Native APIs are injected so lifecycle/security decisions can be tested without bypassing them. */
export class AppLockController {
  private state: SecurityState = {
    hasUnlocked: false,
    ready: false,
    locked: true,
    busy: false,
    settings: { enabled: false, timeout: 60000 },
    error: null,
    backgrounded: false,
  };
  private listeners = new Set<() => void>();
  private backgroundAt: number | null = null;
  private phase = "active";
  private generation = 0;
  private initializing: Promise<void> | null = null;
  constructor(private readonly dependencies: SecurityDependencies) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(update: Partial<SecurityState>) {
    this.state = { ...this.state, ...update };
    for (const listener of this.listeners) listener();
  }
  initialize = (): Promise<void> => {
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      this.set({ busy: true, error: null });
      try {
        const settings = await this.dependencies.load();
        this.set({
          settings,
          ready: true,
          locked: settings.enabled,
          hasUnlocked: !settings.enabled,
        });
      } catch {
        this.set({
          ready: false,
          locked: true,
          error:
            "Security settings could not be loaded. Retry to keep your data protected.",
        });
      } finally {
        this.set({ busy: false });
        this.initializing = null;
      }
    })();
    return this.initializing;
  };
  appState = (phase: string) => {
    const previous = this.phase;
    this.phase = phase;
    if (phase === "background" && previous !== "background") {
      this.backgroundAt = this.dependencies.now();
      this.generation++;
    }
    const locked =
      phase === "active" &&
      this.state.settings.enabled &&
      shouldLockOnForeground(
        this.backgroundAt,
        this.dependencies.now(),
        this.state.settings.timeout,
      );
    if (phase === "active") this.backgroundAt = null;
    this.set({
      backgrounded: phase !== "active",
      ...(locked ? { locked: true } : {}),
    });
  };
  lockApp = () => {
    if (this.state.settings.enabled) {
      this.generation++;
      this.set({ locked: true });
    }
  };
  private async authenticate(enable = false) {
    if (enable) {
      const status = await this.dependencies.capability();
      if (!status.hasHardware)
        throw new Error(
          "Biometric authentication is not available on this device.",
        );
      if (!status.enrolled)
        throw new Error(
          "No biometric authentication is configured. Enroll biometrics in your device security settings first.",
        );
    }
    const generation = this.generation;
    const result = await this.dependencies.authenticate(enable);
    if (!result.success)
      throw new Error(result.message ?? "Authentication was not successful.");
    if (generation !== this.generation || this.phase === "background")
      throw new Error("The app was backgrounded. Authenticate again.");
  }
  private async operation(work: () => Promise<void>) {
    if (this.state.busy || !this.state.ready) return;
    this.set({ busy: true, error: null });
    try {
      await work();
    } catch (error) {
      this.set({
        error:
          error instanceof Error
            ? error.message
            : "Authentication could not be completed. Please try again.",
      });
    } finally {
      this.set({ busy: false });
    }
  }
  unlockApp = () =>
    this.operation(async () => {
      await this.authenticate();
      this.set({ locked: false, hasUnlocked: true });
    });
  enableAppLock = () =>
    this.operation(async () => {
      if (this.state.settings.enabled) return;
      await this.authenticate(true);
      const settings = { ...this.state.settings, enabled: true };
      await this.dependencies.save(settings);
      this.set({ settings, locked: false });
    });
  disableAppLock = () =>
    this.operation(async () => {
      if (!this.state.settings.enabled) return;
      await this.authenticate();
      const settings = { ...this.state.settings, enabled: false };
      await this.dependencies.save(settings);
      this.set({ settings, locked: false });
    });
  setTimeout = (timeout: LockTimeout) =>
    this.operation(async () => {
      if (![0, 60000, 300000, 900000].includes(timeout))
        throw new Error("Choose a supported lock delay.");
      if (this.state.settings.enabled) await this.authenticate();
      const settings = { ...this.state.settings, timeout };
      await this.dependencies.save(settings);
      this.set({ settings });
    });
}
