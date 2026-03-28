import { useWallet }            from '@provablehq/aleo-wallet-adaptor-react';
import { PageHeader }           from '@/components';
import { ConnectWalletPrompt }  from '@/shared/components/wallet/ConnectWalletPrompt';
import { ReferralCommissionsTab } from '../../earnings/components/ReferralCommissionsTab';

export function ReferralPage() {
  const { connected } = useWallet();

  if (!connected) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-5 lg:p-6">
        <PageHeader
          title="Referral"
          description="Earn commissions on bids placed through your referral links."
        />
        <ConnectWalletPrompt message="Connect your wallet to manage referral codes." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-5 lg:p-6">
      <PageHeader
        title="Referral"
        description="Earn commissions on bids placed through your referral links."
      />

      <ReferralCommissionsTab />
    </div>
  );
}
