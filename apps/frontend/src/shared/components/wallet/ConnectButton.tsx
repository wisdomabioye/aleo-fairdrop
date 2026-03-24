import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { Button } from '@/components';
import { WalletMenu } from "./WalletMenu";

export function ConnectButton({className = ""}: {className?: string}) {
  const { address, connected, connecting, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();

  if (!connected || !address) {
    return (
      <Button
        className={className}
        variant="default"
        loading={connecting}
        loadingText="Connecting…"
        onClick={() => setVisible(true)}
      >
        Connect Wallet
      </Button>
    );
  }

  return (
    <WalletMenu
      address={address}
      walletName={wallet?.adapter.name}
      walletIcon={wallet?.adapter.icon}
      onDisconnect={disconnect}
    />
  );
}
