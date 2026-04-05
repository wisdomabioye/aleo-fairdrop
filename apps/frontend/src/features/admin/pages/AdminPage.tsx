import { useEffect }                    from 'react';
import { useNavigate }                   from 'react-router-dom';
import { Spinner, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components';
import { ConnectWalletPrompt }           from '@/shared/components/wallet/ConnectWalletPrompt';
import { useWallet }                     from '@provablehq/aleo-wallet-adaptor-react';
import { AppRoutes }                     from '@/config';
import { ConfigPanel }                   from '../components/config/ConfigPanel';
import { AuthorizationPanel }            from '../components/authorization/AuthorizationPanel';
import { TreasuryPanel }                 from '../components/treasury/TreasuryPanel';
import { UpgradePanel }                  from '../components/upgrades/UpgradePanel';
import { GovernancePanel }               from '../components/governance/GovernancePanel';
import { useAdminGate }                  from '../hooks/useAdminGate';

export function AdminPage() {
  const { connected }                   = useWallet();
  const { isAdmin, isLoading, address } = useAdminGate();
  const navigate                        = useNavigate();

  // Redirect non-admins once we know their status.
  useEffect(() => {
    if (!isLoading && connected && !isAdmin) {
      navigate(AppRoutes.dashboard, { replace: true });
    }
  }, [isAdmin, isLoading, connected, navigate]);

  if (!connected) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-4">
        <h1 className="text-2xl font-semibold">Multisig Admin</h1>
        <ConnectWalletPrompt message="Connect your wallet to access the admin panel." />
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>;
  }

  if (!isAdmin) return null;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Multisig Admin</h1>
        <p className="text-xs text-muted-foreground font-mono mt-1">{address}</p>
      </div>

      <Tabs defaultValue="config">
        <TabsList className="w-full">
          <TabsTrigger value="config"        className="flex-1">Config</TabsTrigger>
          <TabsTrigger value="authorization" className="flex-1">Authorization</TabsTrigger>
          <TabsTrigger value="treasury"      className="flex-1">Treasury</TabsTrigger>
          <TabsTrigger value="upgrades"      className="flex-1">Upgrades</TabsTrigger>
          <TabsTrigger value="governance"    className="flex-1">Governance</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4">
          <ConfigPanel />
        </TabsContent>

        <TabsContent value="authorization" className="mt-4">
          <AuthorizationPanel />
        </TabsContent>

        <TabsContent value="treasury" className="mt-4">
          <TreasuryPanel />
        </TabsContent>

        <TabsContent value="upgrades" className="mt-4">
          <UpgradePanel />
        </TabsContent>

        <TabsContent value="governance" className="mt-4">
          <GovernancePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
