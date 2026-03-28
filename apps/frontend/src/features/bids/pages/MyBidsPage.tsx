/**
 * My Bids — displays private Bid and Commitment records fetched directly from the wallet.
 *
 * Records are encrypted to the owner's key and never indexed by the API.
 * Each auction program is shown as a collapsible section; clicking to expand
 * triggers a lazy fetch via useBidRecords / useCommitmentRecords (plaintext mode).
 */
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { PageHeader } from '@/components';
import { Info } from 'lucide-react';
import { AuctionType } from '@fairdrop/types/domain';
import { ConnectWalletPrompt } from '@/shared/components/wallet/ConnectWalletPrompt';
import { config } from '@/env';
import { ProgramSection } from '../components/ProgramSection';
import type { ProgramMeta } from '../components/ProgramSection';

const PROGRAMS: ProgramMeta[] = [
  { programId: config.programs.dutch.programId,     type: AuctionType.Dutch },
  { programId: config.programs.sealed.programId,    type: AuctionType.Sealed },
  { programId: config.programs.raise.programId,     type: AuctionType.Raise },
  { programId: config.programs.ascending.programId, type: AuctionType.Ascending },
  { programId: config.programs.lbp.programId,       type: AuctionType.Lbp },
  { programId: config.programs.quadratic.programId, type: AuctionType.Quadratic },
];

export function MyBidsPage() {
  const { connected } = useWallet();

  if (!connected) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-5 lg:p-6">
        <PageHeader
          title="My Bids"
          description="Bid records are zero-knowledge proofs encrypted to your address — only your wallet can decrypt them."
        />
        <ConnectWalletPrompt message="Connect your wallet to see your bid records." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-5 lg:p-6">
      <PageHeader
        title="My Bids"
        description="Private bid records stored in your wallet. Expand a program to fetch and view them."
      />

      <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <p>
          Records are fetched directly from your wallet and are never stored by the indexer.
          Sealed commitments (unrevealed bids) appear alongside standard bid records in the Sealed program.
        </p>
      </div>

      <div className="space-y-2">
        {PROGRAMS.map((meta) => (
          <ProgramSection key={meta.programId} meta={meta} />
        ))}
      </div>
    </div>
  );
}
