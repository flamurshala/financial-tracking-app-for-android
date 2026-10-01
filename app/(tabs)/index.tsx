import { router } from 'expo-router';
import { Screen, SectionTitle, Body, Card, Button } from '../../components/ui';
import { localCalendarDate, displayCalendarDate } from '../../utils/dates';
export default function Home() {
  return <Screen><Body>{displayCalendarDate(localCalendarDate())}</Body><SectionTitle>Your finances, clearly.</SectionTitle><Body>A calm place to keep track of everyday spending.</Body><Card><Body>LOCAL WORKSPACE</Body><SectionTitle>Ready for your first entry</SectionTitle><Body>The local database is ready. Transaction entry will be added in the next phase.</Body><Button title="Add transaction" onPress={() => router.push('/transaction/add')} /></Card><Body>Your financial records will be saved on this device first. Cloud backup will be connected in a later phase.</Body></Screen>;
}
