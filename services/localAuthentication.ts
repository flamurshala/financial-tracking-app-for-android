import * as LocalAuthentication from "expo-local-authentication";
export async function getBiometricCapability() {
  const [hasHardware, enrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  return {
    hasHardware,
    enrolled,
    types: types.map((type) =>
      type === LocalAuthentication.AuthenticationType.FINGERPRINT
        ? "Fingerprint"
        : type === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
          ? "Face recognition"
          : "Iris",
    ),
  };
}
export async function authenticateWithBiometrics(biometricOnly = false) {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock Finance",
      cancelLabel: "Cancel",
      fallbackLabel: "Use device passcode",
      disableDeviceFallback: biometricOnly,
    });
    if (result.success) return { success: true };
    const messages: Record<string, string> = {
      user_cancel: "Authentication canceled.",
      system_cancel: "Authentication canceled by the device. Try again.",
      app_cancel: "Authentication canceled.",
      not_enrolled: "No biometric authentication is configured on this device.",
      not_available: "Device authentication is unavailable.",
      lockout:
        "Authentication is temporarily locked. Use the device passcode or try again later.",
      authentication_failed: "Authentication failed. Try again.",
      passcode_not_set: "Configure a device screen lock first.",
    };
    return {
      success: false,
      message: messages[result.error] ?? "Could not authenticate. Try again.",
    };
  } catch {
    return {
      success: false,
      message: "Device authentication could not be opened. Please try again.",
    };
  }
}
