import * as LocalAuthentication from 'expo-local-authentication';
export async function getBiometricCapability() {
  return { hasHardware: await LocalAuthentication.hasHardwareAsync(), enrolled: await LocalAuthentication.isEnrolledAsync() };
}
