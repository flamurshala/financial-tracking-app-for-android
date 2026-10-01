import { useLocalSearchParams } from 'expo-router';
import { Screen, EmptyState } from '../../components/ui';
export default function EditTransaction() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Screen><EmptyState title="Edit transaction" description={`The edit route is ready for record ${id ?? ''}. Record lookup and editing will be implemented later.`} /></Screen>;
}
