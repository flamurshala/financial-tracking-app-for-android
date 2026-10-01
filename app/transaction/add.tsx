import { router } from "expo-router";
import { Screen } from "../../components/ui";
import { TransactionForm } from "../../components/finance/TransactionForm";
export default function AddTransaction() {
  return (
    <Screen>
      <TransactionForm
        onSaved={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/");
        }}
      />
    </Screen>
  );
}
