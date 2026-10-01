import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../hooks/useTheme';
const tabs = [{ name: 'index', title: 'Home', icon: 'home-outline' }, { name: 'transactions', title: 'Transactions', icon: 'swap-horizontal-outline' }, { name: 'statistics', title: 'Statistics', icon: 'bar-chart-outline' }, { name: 'accounts', title: 'Accounts', icon: 'wallet-outline' }, { name: 'settings', title: 'Settings', icon: 'settings-outline' }] as const;
export default function TabLayout() {
  const colors = useTheme();
  return <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border }, headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }}>
    {tabs.map((tab) => <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title, tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon} color={color} size={size} /> }} />)}
  </Tabs>;
}
