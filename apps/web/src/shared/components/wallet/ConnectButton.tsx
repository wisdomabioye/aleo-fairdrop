import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { Button } from '@fairdrop/ui';
import { truncateAddress } from '@fairdrop/sdk/format';

export function ConnectButton() {
  const { address, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  if (connected && address) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => disconnect()}
        title={address}
      >
        {truncateAddress(address)}
      </Button>
    );
  }

  return (
    <Button size="sm" onClick={() => setVisible(true)}>
      Connect Wallet
    </Button>
  );
}
