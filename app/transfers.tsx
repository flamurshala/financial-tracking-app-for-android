import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Screen, SectionTitle, Card, Body, Button } from '../components/ui';
import { QueryState } from '../components/ui/QueryState';
import { getTransferHistory } from '../database/repositories/transferRepository';
import { useLocalQuery } from '../hooks/useLocalQuery';
import { formatAmount } from '../utils/currency';
export default function Transfers() {
  const db=useSQLiteContext();
  const [page,setPage]=useState(0);
  const query=useLocalQuery(useCallback(()=>getTransferHistory(db,51,page*50),[db,page]));
  return <Screen><SectionTitle>Transfer History</SectionTitle>
    <Button title="Transfer Money" onPress={()=>router.push('/transfer/add')}/>
    <QueryState loading={query.loading} error={query.error} retry={query.refresh}/>
    {query.data?.slice(0,50).map(t=><Card key={t.id}><Body>{t.note || 'Transfer'}</Body><Body>{t.from_account_name} → {t.to_account_name}</Body><Body>{formatAmount(t.amount_cents)} · {t.transfer_date}</Body><Button secondary title="View Transfer" onPress={()=>router.push({pathname:'/transfer/[id]',params:{id:t.id}})}/></Card>)}
    {query.data?.length===0 ? <Body>No transfers.</Body> : null}
    {page>0 ? <Button title="Previous" secondary onPress={()=>setPage(page-1)}/> : null}
    {(query.data?.length ?? 0)>50 ? <Button title="Next" secondary onPress={()=>setPage(page+1)}/> : null}
  </Screen>;
}
