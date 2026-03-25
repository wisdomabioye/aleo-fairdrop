import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { PageHeader } from '@/components';
import { ConnectWalletPrompt } from '@/shared/components/wallet/ConnectWalletPrompt';
import { ShieldForm } from '@/features/shield/components';

export function ShieldPage() {
  const { connected } = useWallet();

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <PageHeader
        title="Shield Credits"
        description="Convert public ALEO into a private record for use in private bids."
      />
      {connected
        ? <ShieldForm />
        : <ConnectWalletPrompt message="Connect your wallet to shield credits." />
      }
    </div>
  );
}
