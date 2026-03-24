import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label, Switch } from '@/components';
import { formatMicrocredits, aleoToMicro } from '@fairdrop/sdk/credits';
import { parseTokenAmount } from '@fairdrop/sdk/format';
import { useTransactionStore } from '@/stores/transaction.store';
import { parseExecutionError } from '@/shared/utils/errors';
import type { BidFormProps } from './types';

/**
 * Sealed bid form.
 *
 * COMMIT phase  (blockHeight ≤ params.commit_end_block):
 *   - Enter quantity + a secret nonce
 *   - Payment (collateral) locked; BHP256(qty, nonce, bidder) sent on-chain
 *
 * REVEAL phase  (params.commit_end_block < blockHeight ≤ endBlock):
 *   - Enter the same quantity + nonce used at commit
 *   - Wallet uses the Commitment record (AutoDecrypt) to reveal
 */
export function SealedBidForm({ auction, blockHeight, protocolConfig, lagBlocks }: BidFormProps) {
  const { connected, executeTransaction } = useWallet();
  const { setTx } = useTransactionStore();
  const [searchParams] = useSearchParams();

  const saleScale    = auction.saleScale;
  const currentPrice = auction.currentPrice ?? 0n;

  // Phase detection: use commit_end_block from params when available
  const commitEndBlock = auction.params.type === 'sealed' ? auction.params.commit_end_block : null;
  const isRevealPhase  = commitEndBlock != null
    ? blockHeight > commitEndBlock
    : auction.status === 'ended' || auction.status === 'clearing';

  const [qtyInput,   setQtyInput]   = useState('');
  const [nonce,      setNonce]      = useState('');
  const [payInput,   setPayInput]   = useState(''); // ALEO string for commit collateral
  const [usePrivate, setUsePrivate] = useState(false);
  const [codeId,     setCodeId]     = useState(searchParams.get('ref') ?? '');
  const [txError,    setTxError]    = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);

  const decimals       = auction.saleTokenDecimals ?? 0;
  const qtyRaw         = parseTokenAmount(qtyInput, decimals);
  const qtyHuman       = saleScale > 0n ? qtyRaw / saleScale : 0n;
  const paymentMicro   = aleoToMicro(payInput) ?? (qtyHuman * currentPrice);
  const protocolFee    = paymentMicro * BigInt(protocolConfig.feeBps) / 10_000n;

  const isDisabled = lagBlocks > 10 || !connected || loading;

  async function handleCommit(e: React.FormEvent) {
    e.preventDefault();
    if (isDisabled || !qtyRaw || !nonce || !paymentMicro) return;
    setTxError(null);
    setLoading(true);
    try {
      const hasRef = codeId.trim().length > 0;
      const fn = hasRef
        ? (usePrivate ? 'commit_bid_private_ref' : 'commit_bid_public_ref')
        : (usePrivate ? 'commit_bid_private'     : 'commit_bid_public');

      const inputs: string[] = [
        auction.id,
        `${qtyRaw}u128`,
        `${nonce}field`,
        `${paymentMicro}u64`,
        ...(hasRef ? [`${codeId.trim()}field`] : []),
      ];

      const result = await executeTransaction({
        program:  auction.programId,
        function: fn,
        inputs,
        fee: 0.5,
      });
      if (result?.transactionId) {
        setTx(result.transactionId, 'Commit bid');
      }
    } catch (err) {
      setTxError(parseExecutionError(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  async function handleReveal(e: React.FormEvent) {
    e.preventDefault();
    if (isDisabled || !qtyRaw || !nonce) return;
    setTxError(null);
    setLoading(true);
    try {
      // Commitment record handled by AutoDecrypt — wallet inserts it
      const inputs: string[] = [
        `${qtyRaw}u128`,
        `${nonce}field`,
        `${auction.supply}u128`, // max_bid_amount (D11: config.max_bid_amount)
      ];
      const result = await executeTransaction({
        program:  auction.programId,
        function: 'reveal_bid',
        inputs,
        fee: 0.5,
      });
      if (result?.transactionId) {
        setTx(result.transactionId, 'Reveal bid');
      }
    } catch (err) {
      setTxError(parseExecutionError(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  if (isRevealPhase) {
    return (
      <form onSubmit={handleReveal} className="space-y-4">
        <p className="rounded-md bg-sky-500/10 px-3 py-2 text-xs text-sky-600 dark:text-sky-400">
          Reveal phase — enter the same quantity and nonce you used when committing.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="sealed-reveal-qty">Quantity</Label>
          <Input id="sealed-reveal-qty" inputMode="decimal" placeholder="0"
            value={qtyInput} onChange={(e) => setQtyInput(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sealed-reveal-nonce">Nonce (secret)</Label>
          <Input id="sealed-reveal-nonce" placeholder="field element"
            value={nonce} onChange={(e) => setNonce(e.target.value)} />
        </div>
        {txError && <p className="text-xs text-destructive">{txError}</p>}
        <Button type="submit" className="w-full" disabled={isDisabled || !qtyRaw || !nonce}>
          {loading ? 'Submitting…' : 'Reveal Bid'}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleCommit} className="space-y-4">
      {lagBlocks > 10 && (
        <p className="rounded-md bg-yellow-500/10 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
          Indexer is {lagBlocks} blocks behind — bidding is temporarily disabled.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Commit phase — your quantity and nonce are hidden on-chain. Save your nonce to reveal later.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="sealed-qty">
          Quantity {auction.saleTokenSymbol ? `(${auction.saleTokenSymbol})` : ''}
        </Label>
        <Input id="sealed-qty" inputMode="decimal" placeholder="0"
          value={qtyInput} onChange={(e) => setQtyInput(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sealed-nonce">Nonce (secret — save this)</Label>
        <Input id="sealed-nonce" placeholder="random field element"
          value={nonce} onChange={(e) => setNonce(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sealed-pay">Collateral (ALEO)</Label>
        <Input id="sealed-pay" inputMode="decimal" placeholder="auto-computed from qty × price"
          value={payInput} onChange={(e) => setPayInput(e.target.value)} />
        {!payInput && qtyHuman > 0n && currentPrice > 0n && (
          <p className="text-xs text-muted-foreground">
            Suggested: {formatMicrocredits(qtyHuman * currentPrice)}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Use private credits</span>
        <Switch checked={usePrivate} onCheckedChange={setUsePrivate} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sealed-ref">Referral code (optional)</Label>
        <Input id="sealed-ref" placeholder="code_id field"
          value={codeId} onChange={(e) => setCodeId(e.target.value)} />
      </div>
      {paymentMicro > 0n && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Collateral locked</span>
            <span>{formatMicrocredits(paymentMicro)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Protocol fee est. ({protocolConfig.feeBps / 100}%)</span>
            <span>~{formatMicrocredits(protocolFee)}</span>
          </div>
        </div>
      )}
      {txError && <p className="text-xs text-destructive">{txError}</p>}
      <Button type="submit" className="w-full" disabled={isDisabled || !qtyRaw || !nonce || !paymentMicro}>
        {loading ? 'Submitting…' : 'Commit Bid'}
      </Button>
    </form>
  );
}
