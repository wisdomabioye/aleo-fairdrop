import { useState, useMemo } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Droplets } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
  Spinner,
} from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { formatAmount, parseTokenAmount } from '@fairdrop/sdk/format';
import { AuctionStatus } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { useSeedLiquidity } from '../hooks/useSeedLiquidity';

interface Props {
  auction:           AuctionView;
  paymentsWithdrawn: bigint;
  unsoldWithdrawn:   bigint;
}

const SLIPPAGE_BPS = 100n;   // 1% default

export function SeedLiquidityPanel({ auction, paymentsWithdrawn, unsoldWithdrawn }: Props) {
  const { connected, address } = useWallet();
  const { step, txIds, error, execute, reset } = useSeedLiquidity(auction);

  const isCreator = connected && address === auction.creator;
  const isCleared = auction.status === AuctionStatus.Cleared;

  const decimals = auction.saleTokenDecimals;
  const symbol   = auction.saleTokenSymbol ?? '';

  const revenueLeft = BigInt(auction.creatorRevenue ?? 0) - paymentsWithdrawn;
  const unsoldLeft  = (BigInt(auction.supply) - BigInt(auction.totalCommitted)) - unsoldWithdrawn;

  const [creditsStr, setCreditsStr] = useState('');
  const [tokenStr,   setTokenStr]   = useState('');

  const creditsAmount = useMemo(() => parseTokenAmount(creditsStr, 6),       [creditsStr]);
  const tokenAmount   = useMemo(() => parseTokenAmount(tokenStr,   decimals), [tokenStr, decimals]);

  // Implied initial price: credits per token (display only)
  const impliedPrice = useMemo(() => {
    if (creditsAmount <= 0n || tokenAmount <= 0n) return null;
    const scale = BigInt(10 ** decimals);
    return (creditsAmount * scale) / tokenAmount;   // microcredits per token unit
  }, [creditsAmount, tokenAmount, decimals]);

  // Min LP tokens: just a placeholder until DEX ABI is confirmed
  const minLpTokens = creditsAmount > 0n
    ? creditsAmount - (creditsAmount * SLIPPAGE_BPS) / 10000n
    : 0n;

  const creditsError = creditsStr && (creditsAmount <= 0n || creditsAmount > revenueLeft)
    ? creditsAmount <= 0n ? 'Enter a valid amount.' : `Max ${formatMicrocredits(revenueLeft)}.`
    : null;
  const tokenError = tokenStr && (tokenAmount <= 0n || tokenAmount > unsoldLeft)
    ? tokenAmount <= 0n ? 'Enter a valid amount.' : `Max ${formatAmount(unsoldLeft, decimals)} ${symbol}.`
    : null;

  const canSeed = isCreator && isCleared && revenueLeft > 0n && unsoldLeft > 0n;
  const busy    = step === 'withdrawing' || step === 'withdrawing_unsold' || step === 'seeding';
  const canSubmit = canSeed && !busy && creditsAmount > 0n && tokenAmount > 0n && !creditsError && !tokenError;

  const stepLabel: Record<typeof step, string> = {
    idle:               '',
    withdrawing:        'Withdrawing credits…',
    withdrawing_unsold: 'Withdrawing tokens…',
    seeding:            'Seeding pool…',
    done:               '',
    error:              '',
  };

  if (!isCreator || !isCleared) return null;
  if (revenueLeft <= 0n && unsoldLeft <= 0n) return null;

  return (
    <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <Droplets className="size-3.5 text-sky-400" />
          Seed Liquidity Pool
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 pt-3">
        <p className="text-[11px] text-muted-foreground">
          Seed a <code className="font-mono">private_dex.aleo</code> liquidity pool using your
          revenue and unsold tokens. Transactions execute in sequence.
        </p>

        {/* Credits input */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-muted-foreground">Credits to seed</label>
            <span className="text-[11px] text-muted-foreground">
              Available: {formatMicrocredits(revenueLeft)}
            </span>
          </div>
          <input
            type="number"
            min="0"
            className="w-full rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500/40"
            value={creditsStr}
            onChange={(e) => setCreditsStr(e.target.value)}
            placeholder="0.0 ALEO"
            disabled={busy}
          />
          {creditsError && <p className="text-[11px] text-destructive">{creditsError}</p>}
        </div>

        {/* Token input */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-muted-foreground">Tokens to seed</label>
            <span className="text-[11px] text-muted-foreground">
              Available: {formatAmount(unsoldLeft, decimals)}{symbol ? ` ${symbol}` : ''}
            </span>
          </div>
          <input
            type="number"
            min="0"
            className="w-full rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500/40"
            value={tokenStr}
            onChange={(e) => setTokenStr(e.target.value)}
            placeholder={`0 ${symbol}`}
            disabled={busy}
          />
          {tokenError && <p className="text-[11px] text-destructive">{tokenError}</p>}
        </div>

        {/* Implied price */}
        {impliedPrice != null && (
          <p className="text-[11px] text-muted-foreground">
            Implied price:{' '}
            <span className="font-medium text-foreground">
              {formatMicrocredits(impliedPrice)} / {symbol || 'token'}
            </span>
          </p>
        )}

        <Separator />

        {/* Step status */}
        {busy && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Spinner className="size-3" />
            {stepLabel[step]}
          </p>
        )}

        {txIds.length > 0 && (
          <ul className="space-y-0.5">
            {txIds.map((id, i) => (
              <li key={id} className="truncate font-mono text-[10px] text-muted-foreground">
                [{i + 1}] {id}
              </li>
            ))}
          </ul>
        )}

        {step === 'done' && (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
            Pool seeded successfully.
          </p>
        )}

        {error && (
          <p className="rounded-md border border-destructive/15 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-destructive">
            {error}
          </p>
        )}

        <Button
          size="sm"
          variant="outline"
          className="w-full border-sky-500/10 bg-background/60 hover:bg-background/80"
          disabled={!canSubmit}
          onClick={step === 'error' || step === 'done'
            ? reset
            : () => void execute(creditsAmount, tokenAmount, minLpTokens)}
        >
          {busy
            ? <><Spinner className="mr-2 size-3" />{stepLabel[step]}</>
            : step === 'done' || step === 'error'
              ? 'Reset'
              : <><Droplets className="mr-2 size-3.5" />Seed Pool</>}
        </Button>

        <p className="text-[10px] text-muted-foreground">
          Requires <code className="font-mono">private_dex.aleo</code> to be deployed.
          3 sequential transactions — do not close this page until complete.
        </p>
      </CardContent>
    </Card>
  );
}
