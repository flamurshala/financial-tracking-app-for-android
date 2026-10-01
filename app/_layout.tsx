import { Suspense } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AppErrorBoundary } from "../components/ui/AppErrorBoundary";
import { databaseName } from "../constants/config";
import { initializeDatabase } from "../database/database";
import { useTheme } from "../hooks/useTheme";
import { ReminderLifecycle } from "../components/ReminderLifecycle";
export default function RootLayout() {
  const colors = useTheme();
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <Suspense
          fallback={
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                backgroundColor: colors.background,
              }}
            >
              <ActivityIndicator accessibilityLabel="Opening local database" />
            </View>
          }
        >
          <SQLiteProvider
            databaseName={databaseName}
            onInit={initializeDatabase}
            useSuspense
          >
            <ReminderLifecycle />
            <StatusBar
              style={colors.background === "#111820" ? "light" : "dark"}
            />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.surface },
                headerTintColor: colors.text,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="(auth)/login"
                options={{ title: "Cloud account" }}
              />
              <Stack.Screen
                name="transaction/add"
                options={{ title: "Add transaction", presentation: "modal" }}
              />
              <Stack.Screen
                name="transaction/[id]"
                options={{ title: "Transaction details" }}
              />
              <Stack.Screen
                name="account/add"
                options={{ title: "Create account", presentation: "modal" }}
              />
              <Stack.Screen
                name="account/[id]"
                options={{ title: "Account" }}
              />
              <Stack.Screen
                name="account/adjust/[id]"
                options={{ title: "Adjust Balance" }}
              />
              <Stack.Screen
                name="category/[id]"
                options={{ title: "Category report" }}
              />
            </Stack>
          </SQLiteProvider>
        </Suspense>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
