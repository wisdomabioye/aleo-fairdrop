/**
 * Token Manager — burn private token records and manage roles on token_registry.aleo.
 */
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
  Tabs, TabsList, TabsTrigger, TabsContent,
  PageHeader,
} from '@/components';
import { Flame, ShieldCheck } from 'lucide-react';
import { ConnectWalletPrompt } from '@/shared/components/wallet/ConnectWalletPrompt';
import { BurnTokenForm, RoleManagementForm } from '@/features/token-manager/components';

export function TokenManagerPage() {
  const { connected } = useWallet();

  if (!connected) {
    return (
      <div className="mx-auto max-w-xl space-y-6 p-6">
        <PageHeader title="Token Manager" description="Burn tokens and manage roles on token_registry.aleo." />
        <ConnectWalletPrompt message="Connect your wallet to manage tokens." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <PageHeader title="Token Manager" description="Burn tokens and manage roles on token_registry.aleo." />

      <Tabs defaultValue="roles">
        <TabsList className="w-full">
          <TabsTrigger value="roles" className="flex-1">
            <ShieldCheck className="mr-1.5 size-4" />
            Role Management
          </TabsTrigger>
          <TabsTrigger value="burn" className="flex-1">
            <Flame className="mr-1.5 size-4" />
            Burn Tokens
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle>Role Management</CardTitle>
              <CardDescription>Assign or revoke minter, burner, or supply manager roles.</CardDescription>
            </CardHeader>
            <CardContent>
              <RoleManagementForm />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="burn">
          <Card>
            <CardHeader>
              <CardTitle>Burn Tokens</CardTitle>
              <CardDescription>Permanently destroy a private token record. Returns any remainder to your wallet.</CardDescription>
            </CardHeader>
            <CardContent>
              <BurnTokenForm />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
