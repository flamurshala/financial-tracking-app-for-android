import { useEffect, useState, useSyncExternalStore } from "react";
import { Linking, Platform, Switch } from "react-native";
import { appLock } from "../../services/appLock";
import { getBiometricCapability } from "../../services/localAuthentication";
import type { BiometricStatus, LockTimeout } from "../../types/security";
import { lockTimeouts } from "../../types/security";
import { Body, Button, Card } from "../ui";
import { ChoicePicker } from "../ui/Choice";
export function SecuritySettings() {
  const state = useSyncExternalStore(appLock.subscribe, appLock.getSnapshot);
  const [capability, setCapability] = useState<BiometricStatus | null>(null);
  useEffect(() => {
    void getBiometricCapability()
      .then(setCapability)
      .catch(() => setCapability(null));
  }, []);
  return (
    <Card>
      <Body>App Lock</Body>
      <Switch
        accessibilityLabel="App Lock"
        value={state.settings.enabled}
        disabled={state.busy || !state.ready || Platform.OS === "web"}
        onValueChange={(enabled) =>
          void (enabled ? appLock.enableAppLock() : appLock.disableAppLock())
        }
      />
      <Body>Unlock method: Biometrics with device passcode fallback</Body>
      <ChoicePicker
        label="Lock After"
        value={String(state.settings.timeout)}
        disabled={state.busy}
        options={lockTimeouts.map((row) => ({
          value: String(row.value),
          label: row.label,
        }))}
        onChange={(value) =>
          void appLock.setTimeout(Number(value) as LockTimeout)
        }
      />
      {state.error ? <Body>{state.error}</Body> : null}
      <Body>
        Enable or disable App Lock only after verifying your identity. Cold
        starts always require unlocking. This setting stays on this device when
        you sign out.
      </Body>
      <Button
        secondary
        title="Open device settings"
        onPress={() => void Linking.openSettings()}
      />
      {state.settings.enabled ? (
        <Button secondary title="Lock now" onPress={appLock.lockApp} />
      ) : null}
      {__DEV__ ? (
        <>
          <Body>
            Biometric Hardware:{" "}
            {capability?.hasHardware ? "Available" : "Unavailable"}
          </Body>
          <Body>
            Biometric Enrollment: {capability?.enrolled ? "Yes" : "No"}
          </Body>
          <Body>Supported Types: {capability?.types.join(", ") || "None"}</Body>
        </>
      ) : null}
    </Card>
  );
}
