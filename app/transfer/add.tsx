import { router, useLocalSearchParams } from 'expo-router';
import { Screen, SectionTitle } from '../../components/ui';
import { TransferForm } from '../../components/finance/TransferForm';
export default function AddTransfer() {
  const { fromAccountId } = useLocalSearchParams<{fromAccountId?: string}>();
  return <Screen><SectionTitle>Transfer Money</SectionTitle><TransferForm fromAccountId={fromAccountId} onSaved={() => router.back()} /></Screen>;
}
