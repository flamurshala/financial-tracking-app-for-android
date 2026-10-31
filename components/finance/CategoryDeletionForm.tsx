import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getCategoryDeletionPlan, deleteCategory } from '../../database/repositories/categoryRepository';
import { useLocalQuery } from '../../hooks/useLocalQuery';
import { useFinanceStore } from '../../store/financeStore';
import { Card, Body, Button } from '../ui';
import { ChoicePicker } from '../ui/Choice';
import { QueryState } from '../ui/QueryState';
export function CategoryDeletionForm({id,onDone}:{id:string;onDone:()=>void}) {
  const db=useSQLiteContext();
  const query=useLocalQuery(useCallback(()=>getCategoryDeletionPlan(db,id),[db,id]));
  const [replacement,setReplacement]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const plan=query.data;
  const remove=async()=>{
    if(busy)return;
    setBusy(true);
    try {await deleteCategory(db,id,replacement || undefined);useFinanceStore.getState().invalidate('Category permanently deleted');onDone();}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not delete category');}
    finally{setBusy(false);}
  };
  const selected=plan?.replacements.find(c=>c.id===replacement);
  return <Card><QueryState loading={query.loading} error={query.error} retry={query.refresh}/>
    {plan ? <>
      <Body>Delete “{plan.category.name}” permanently?</Body>
      <Body>{plan.transactionCount} transactions, including deleted history, reference this category. Descriptions will remain unchanged.</Body>
      {plan.transactionCount ? <>
        <ChoicePicker label="Move transactions to" value={replacement} options={plan.replacements.map(c=>({value:c.id,label:c.name+' · '+c.type+' · '+c.id.slice(-8)}))} onChange={setReplacement} disabled={busy}/>
        {!plan.replacements.length ? <Body>No compatible replacement exists. Cancel and create an active category that supports all referenced transaction types first.</Body> : null}
        {selected ? <Body>{plan.transactionCount} transactions will move from {plan.category.name} to {selected.name}.</Body> : null}
      </> : <Body>This category has no transactions.</Body>}
      <Button title={plan.transactionCount ? `Move ${plan.transactionCount} Transactions and Delete Category` : 'Delete Permanently'} disabled={busy || Boolean(plan.transactionCount && !selected)} onPress={()=>Alert.alert('Confirm permanent deletion',`Delete "${plan.category.name}"? ${selected ? `Move all ${plan.transactionCount} transactions to "${selected.name}". ` : ''}This cannot be undone.`,[{text:'Cancel',style:'cancel'},{text:'Delete Permanently',style:'destructive',onPress:()=>void remove()}])}/>
    </> : null}
    {error ? <Body>{error}</Body> : null}
    <Button secondary title="Cancel" disabled={busy} onPress={onDone}/>
  </Card>;
}
