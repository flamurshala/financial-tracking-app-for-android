import {
  useEffect,
  useState,
  useRef,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import {
  AppState,
  Modal,
  Platform,
  StyleSheet,
  View,
  ActivityIndicator,
} from "react-native";
import * as ScreenCapture from "expo-screen-capture";
import { appLock } from "../../services/appLock";
import { useTheme } from "../../hooks/useTheme";
import { Body, Button, SectionTitle } from "../ui";
export function AppLockGate({ children }: PropsWithChildren) {
  const privacyQueue = useRef<Promise<void>>(Promise.resolve());
  const state = useSyncExternalStore(appLock.subscribe, appLock.getSnapshot);
  const colors = useTheme();
  const [capture, setCapture] = useState<{
    enabled: boolean;
    error: boolean;
  } | null>(null);
  const captureReady = capture?.enabled === state.settings.enabled;
  const captureError = captureReady && capture?.error;
  useEffect(() => {
    appLock.appState(AppState.currentState);
    void appLock.initialize();
    const subscription = AppState.addEventListener("change", appLock.appState);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    let alive = true;
    const protect = async () => {
      let error = false;
      try {
        if (Platform.OS !== "web") {
          if (state.settings.enabled) {
            await ScreenCapture.preventScreenCaptureAsync("finance-lock");
            if (Platform.OS === "ios")
              await ScreenCapture.enableAppSwitcherProtectionAsync();
          } else {
            await ScreenCapture.allowScreenCaptureAsync("finance-lock");
            if (Platform.OS === "ios")
              await ScreenCapture.disableAppSwitcherProtectionAsync();
          }
        }
      } catch {
        error = true;
      } finally {
        if (alive) setCapture({ enabled: state.settings.enabled, error });
      }
    };
    if (state.ready)
      privacyQueue.current = privacyQueue.current
        .catch(() => undefined)
        .then(protect);
    return () => {
      alive = false;
    };
  }, [state.ready, state.settings.enabled]);
  const blocked =
    !state.ready ||
    state.locked ||
    (state.settings.enabled && (state.backgrounded || !captureReady));
  const lockView = (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: "center",
        padding: 32,
        gap: 20,
      }}
    >
      <SectionTitle>Finance Tracker</SectionTitle>
      <Body>{state.ready ? "App Locked" : "Loading security settings…"}</Body>
      {state.error ? <Body>{state.error}</Body> : null}
      {!state.ready && state.busy ? (
        <ActivityIndicator accessibilityLabel="Loading security settings" />
      ) : (
        <Button
          title={
            state.busy ? "Authenticating…" : state.ready ? "Unlock" : "Retry"
          }
          disabled={state.busy}
          onPress={() =>
            void (state.ready ? appLock.unlockApp() : appLock.initialize())
          }
        />
      )}
    </View>
  );
  if (!state.hasUnlocked && blocked) return lockView;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{ flex: 1, opacity: blocked ? 0 : 1 }}
        pointerEvents={blocked ? "none" : "auto"}
        accessibilityElementsHidden={blocked}
        importantForAccessibility={blocked ? "no-hide-descendants" : "auto"}
      >
        {children}
      </View>
      {blocked ? <View style={StyleSheet.absoluteFill}>{lockView}</View> : null}
      <Modal
        visible={blocked}
        animationType="none"
        presentationStyle="fullScreen"
        onRequestClose={() => {}}
      >
        {lockView}
      </Modal>
      {captureError && !blocked ? (
        <View style={{ padding: 8, backgroundColor: colors.surface }}>
          <Body>
            Screen capture protection is unavailable on this device. App Lock
            still protects access.
          </Body>
        </View>
      ) : null}
    </View>
  );
}
