import { router } from 'expo-router';
import { Screen, EmptyState, Button } from '../components/ui';
export default function NotFound() {
  return <Screen><EmptyState title="Page not found" description="This page is not available." /><Button title="Return home" onPress={() => router.replace('/')} /></Screen>;
}
