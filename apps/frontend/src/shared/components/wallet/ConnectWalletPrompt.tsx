import { ShieldCheck, Wallet2 } from 'lucide-react';
import { useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components';

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
    <div className="flex justify-center px-4 py-8 sm:py-12">
      <Empty className="max-w-xl border-sky-500/12 bg-gradient-surface px-6 py-8 shadow-brand ring-1 ring-white/5">
        <EmptyHeader className="max-w-md">
          <EmptyMedia
            variant="icon"
            className="relative border-sky-500/14 bg-sky-500/10 text-sky-500 dark:text-sky-300"
          >
            <Wallet2 className="size-5" />
            <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border border-emerald-500/15 bg-emerald-500/12 text-emerald-500 dark:text-emerald-400">
              <ShieldCheck className="size-3" />
            </span>
          </EmptyMedia>

          <EmptyTitle>{heading}</EmptyTitle>
          <EmptyDescription>{message}</EmptyDescription>
        </EmptyHeader>

        <EmptyContent className="max-w-md gap-3">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={() => setVisible(true)}
              className="min-w-36 rounded-xl"
            >
              <Wallet2 className="size-4" />
              Connect Wallet
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Securely connect an Aleo wallet to place bids, manage auctions, and claim allocations.
          </p>
        </EmptyContent>
      </Empty>
    </div>
  );
}
