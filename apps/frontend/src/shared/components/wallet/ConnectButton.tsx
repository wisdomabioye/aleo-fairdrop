import { Wallet2, ChevronDown } from 'lucide-react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { Button } from '@/components';
import { cn } from '@/lib/utils';
import { WalletMenu } from './WalletMenu';

export function ConnectButton({ className = '' }: { className?: string }) {
  const { address, connected, connecting, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();

  if (!connected || !address) {
    return (
      <Button
        className={cn(
          'group relative h-9 overflow-hidden rounded-xl border border-sky-500/14 bg-gradient-to-r from-sky-500/90 via-cyan-500/85 to-sky-500/90 px-4 text-white shadow-brand transition-[transform,box-shadow,filter] hover:scale-[1.01] hover:brightness-105',
          'before:absolute before:inset-y-0 before:left-[-30%] before:w-1/3 before:-skew-x-12 before:bg-white/12 before:blur-xl before:transition-transform before:duration-700 hover:before:translate-x-[260%]',
          className
        )}
        variant="default"
        loading={connecting}
        loadingText="Connecting…"
        onClick={() => setVisible(true)}
      >
        <Wallet2 className="size-4" />
        <span>Connect Wallet</span>
        <ChevronDown className="size-4 opacity-80 transition-transform group-hover:translate-y-[1px]" />
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
