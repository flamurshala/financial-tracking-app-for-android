import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { z } from "zod";
import { AppLockController } from "./security/appLockController";
import {
  authenticateWithBiometrics,
  getBiometricCapability,
} from "./localAuthentication";
const schema = z.object({
  enabled: z.boolean(),
  timeout: z.union([
    z.literal(0),
    z.literal(60000),
    z.literal(300000),
    z.literal(900000),
  ]),
});
const key = "finance.app-lock.v1";
export const appLock = new AppLockController({
  now: Date.now,
  capability: getBiometricCapability,
  authenticate: authenticateWithBiometrics,
  load: async () => {
    if (Platform.OS === "web") return { enabled: false, timeout: 60000 };
    const raw = await SecureStore.getItemAsync(key);
    return raw === null
      ? { enabled: false, timeout: 60000 }
      : schema.parse(JSON.parse(raw));
  },
  save: async (settings) => {
    if (Platform.OS === "web")
      throw new Error("App Lock requires an Android or iOS device.");
    await SecureStore.setItemAsync(
      key,
      JSON.stringify(schema.parse(settings)),
      { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
    );
  },
});
