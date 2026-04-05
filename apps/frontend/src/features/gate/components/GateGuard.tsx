import { useState, useEffect, type ReactNode } from 'react';
import { useWallet }             from '@provablehq/aleo-wallet-adaptor-react';
import { Spinner }               from '@/components';
import { fetchIsVerified }       from '@fairdrop/sdk/chain';
import { computeBidderKey }      from '@fairdrop/sdk/hash';
import { GateMode }              from '@fairdrop/types/domain';
import type { AuctionView }      from '@fairdrop/types/domain';
import { MerkleGateForm }        from './MerkleGateForm';
import { CredentialGateForm }    from './CredentialGateForm';

interface Props {
  auction:  AuctionView;
  children: ReactNode;
}

/**
 * Renders children (the bid form) only when the connected wallet has passed
 * the gate. For open auctions this is a transparent pass-through.
 * For Merkle / Credential gated auctions it shows the appropriate proof form
 * until the on-chain verified flag is set.
 */
export function GateGuard({ auction, children }: Props) {
  const { address } = useWallet();

  const [verified,  setVerified]  = useState<boolean | null>(null); // null = loading
  const [checkKey,  setCheckKey]  = useState(0); // increment to re-check after tx confirms

  const isOpen = auction.gateMode === GateMode.Open;

  useEffect(() => {
    if (isOpen) { setVerified(true); return; }
    if (!address) { setVerified(false); return; }

    const bidderKey = computeBidderKey(address, auction.id);
    fetchIsVerified(bidderKey)
      .then(setVerified)
      .catch(() => setVerified(false));
  }, [isOpen, address, auction.id, checkKey]);

  // Open auction — pass straight through
  if (isOpen) return <>{children}</>;

  // Checking on-chain
  if (verified === null) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Spinner className="size-3" /> Checking gate status…
      </div>
    );
  }

  // Already verified — show the bid form
  if (verified) return <>{children}</>;

  // Not verified — show the appropriate gate form
  const title =
    auction.gateMode === GateMode.Merkle
      ? 'Merkle allowlist proof required'
      : 'Issuer credential required';

  const description =
    auction.gateMode === GateMode.Merkle
      ? 'Submit your Merkle proof once to unlock bidding on this auction.'
      : 'Submit your issuer-signed credential once to unlock bidding on this auction.';

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>

      {auction.gateMode === GateMode.Merkle ? (
        <MerkleGateForm
          auctionId={auction.id}
          onVerified={() => setCheckKey((k) => k + 1)}
        />
      ) : (
        <CredentialGateForm
          auctionId={auction.id}
          onVerified={() => setCheckKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
