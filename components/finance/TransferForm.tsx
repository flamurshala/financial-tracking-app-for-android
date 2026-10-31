import { useCallback, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import type { Transfer } from '../../types/finance';
import { getAccounts } from '../../database/repositories/accountRepository';
import { saveTransfer } from '../../database/repositories/transferRepository';
import { useLocalQuery } from '../../hooks/useLocalQuery';
import { useFinanceStore } from '../../store/financeStore';
import { centsToDecimal, decimalToCents } from '../../utils/currency';
import { localCalendarDate } from '../../utils/dates';
import { decimalField } from '../../utils/entryForm';
import { Body, Button, Input } from '../ui';
import { QueryState } from '../ui/QueryState';
import { ChoicePicker } from '../ui/Choice';
import { DateField } from './DateField';
export function TransferForm({ initial, fromAccountId, onSaved }: { initial?: Transfer; fromAccountId?: string; onSaved: () => void }) {
  const db = useSQLiteContext();
  const query = useLocalQuery(useCallback(() => getAccounts(db,true),[db]));
  const [from,setFrom] = useState(initial?.from_account_id ?? fromAccountId ?? '');
  const [to,setTo] = useState(initial?.to_account_id ?? '');
  const [amount,setAmount] = useState(initial ? centsToDecimal(initial.amount_cents) : '');
  const [date,setDate] = useState(initial?.transfer_date ?? localCalendarDate());
  const [note,setNote] = useState(initial?.note ?? '');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const options = query.data?.filter(a => !a.is_archived || a.id === initial?.from_account_id || a.id === initial?.to_account_id).map(a => ({value:a.id,label:a.name+(a.is_archived ? ' (archived)' : '')})) ?? [];
  const save = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      decimalField().parse(amount);
      await saveTransfer(db,{from_account_id:from,to_account_id:to,amount_cents:decimalToCents(amount),transfer_date:date,note},initial?.id);
      useFinanceStore.getState().invalidate('Transfer saved locally'); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save transfer'); }
    finally { setBusy(false); }
  };
  return <>
    <QueryState loading={query.loading} error={query.error} retry={query.refresh} />
    <Body>Move money between your accounts. Income and spending stay unchanged. Negative balances are allowed.</Body>
    {options.length < 2 ? <Body>Create at least two active accounts to transfer money.</Body> : null}
    <ChoicePicker label="From Account" value={from} options={options} onChange={setFrom} disabled={busy} />
    <ChoicePicker label="To Account" value={to} options={options.filter(a => a.value !== from)} onChange={setTo} disabled={busy} />
    <Input label="Amount · EUR" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!busy} />
    <DateField value={date} onChange={setDate} disabled={busy} />
    <Input label="Note (optional)" value={note} onChangeText={setNote} maxLength={2000} editable={!busy} />
    {error ? <Body>{error}</Body> : null}
    <Button title={initial ? 'Save Transfer' : 'Transfer Money'} disabled={busy || query.loading} onPress={() => void save()} />
  </>;
}
