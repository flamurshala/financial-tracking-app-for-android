import { router } from "expo-router";
import { Screen } from "../../components/ui";
import { AccountForm } from "../../components/finance/AccountForm";
export default function AddAccount() {
  return (
    <Screen>
      <AccountForm
        onSaved={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)/accounts");
        }}
      />
    </Screen>
  );
}
