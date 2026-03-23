import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { Button } from '@fairdrop/ui';

interface ConnectWalletPromptProps {
  heading?: string;
  message?: string;
}

export function ConnectWalletPrompt({
  heading = 'Wallet not connected',
  message = 'Connect your wallet to continue.',
}: ConnectWalletPromptProps) {
  const { setVisible } = useWalletModal();

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="text-base font-medium text-foreground">{heading}</p>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button onClick={() => setVisible(true)}>Connect Wallet</Button>
    </div>
  );
}
