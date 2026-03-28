import type { BidFormProps } from './types';
import { SealedCommitForm } from './SealedCommitForm';
import { SealedRevealForm } from './SealedRevealForm';

export function SealedBidForm({ auction, blockHeight, protocolConfig, onBidSuccess }: BidFormProps) {
  const commitEndBlock = auction.params.type === 'sealed' ? auction.params.commit_end_block : null;
  const isRevealPhase  = commitEndBlock != null
    ? blockHeight > commitEndBlock
    : auction.status === 'ended' || auction.status === 'clearing';

  return isRevealPhase
    ? <SealedRevealForm auction={auction} onBidSuccess={onBidSuccess} />
    : <SealedCommitForm auction={auction} protocolConfig={protocolConfig!} onBidSuccess={onBidSuccess} />;
}
