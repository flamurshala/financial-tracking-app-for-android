import { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppErrorBoundary } from '../components/ui/AppErrorBoundary';
import { databaseName } from '../constants/config';
import { initializeDatabase } from '../database/database';
import { useTheme } from '../hooks/useTheme';
export default function RootLayout() {
  const colors = useTheme();
  return <SafeAreaProvider><AppErrorBoundary><Suspense fallback={<View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator accessibilityLabel="Opening local database" /></View>}><SQLiteProvider databaseName={databaseName} onInit={initializeDatabase} useSuspense><StatusBar style={colors.background === '#111820' ? 'light' : 'dark'} /><Stack screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.background } }}><Stack.Screen name="(tabs)" options={{ headerShown: false }} /><Stack.Screen name="(auth)/login" options={{ title: 'Cloud account' }} /><Stack.Screen name="transaction/add" options={{ title: 'Add transaction', presentation: 'modal' }} /><Stack.Screen name="transaction/[id]" options={{ title: 'Edit transaction' }} /></Stack></SQLiteProvider></Suspense></AppErrorBoundary></SafeAreaProvider>;
}
