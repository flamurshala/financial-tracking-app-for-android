import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Screen, SectionTitle, Button, Body } from '../../components/ui';
import { QueryState } from '../../components/ui/QueryState';
import { TransferForm } from '../../components/finance/TransferForm';
import { getTransferById, deleteTransfer } from '../../database/repositories/transferRepository';
import { getAccounts } from '../../database/repositories/accountRepository';
import { useLocalQuery } from '../../hooks/useLocalQuery';
import { useFinanceStore } from '../../store/financeStore';
import { formatAmount } from '../../utils/currency';
export default function TransferDetail() {
  const { id } = useLocalSearchParams<{id:string}>();
  const db = useSQLiteContext();
  const [editing,setEditing] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const query = useLocalQuery(useCallback(async () => ({transfer:await getTransferById(db,id),accounts:await getAccounts(db,true)}),[db,id]));
  const remove = async () => {
    setBusy(true);
    try { await deleteTransfer(db,id); useFinanceStore.getState().invalidate('Transfer deleted'); router.back(); }
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Could not delete transfer');}
    finally {setBusy(false);}
  };
  const t = query.data?.transfer;
  return <Screen><SectionTitle>Transfer</SectionTitle><QueryState loading={query.loading} error={query.error} retry={query.refresh}/>
    {t ? editing ? <TransferForm initial={t} onSaved={() => setEditing(false)} /> : <>
      <Body>From Account: {query.data?.accounts.find(a => a.id===t.from_account_id)?.name}</Body>
      <Body>To Account: {query.data?.accounts.find(a => a.id===t.to_account_id)?.name}</Body>
      <Body>Amount: {formatAmount(t.amount_cents)}</Body><Body>Date: {t.transfer_date}</Body><Body>Note: {t.note || '—'}</Body>
      <Button title="Edit Transfer" disabled={busy} onPress={() => setEditing(true)} />
      <Button title="Delete Transfer" disabled={busy} secondary onPress={() => Alert.alert('Delete transfer?','Both account balances will be recalculated.',[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:()=>void remove()}])}/>
    </> : query.data ? <Body>Transfer not found.</Body> : null}
    {editing ? <Button secondary title="Cancel editing" onPress={() => setEditing(false)}/> : null}
    {error ? <Body>{error}</Body> : null}
  </Screen>;
}
