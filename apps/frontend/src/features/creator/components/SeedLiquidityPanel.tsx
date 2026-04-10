import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import {
  Button,
  Card,
  CardContent,
  Label,
  Spinner,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components';
import { TokenAmountInput } from '@/components/fairdrop/token-amount-input';
import { validateSeedLiquidity, type SeedLiquidityInput, type SeedLiquidityValidation } from '@fairdrop/sdk/dex';
import { WizardTxStatus } from '@/shared/components/WizardTxStatus';
import { useSeedLiquidity } from '../hooks/useSeedLiquidity';
import type { AuctionView } from '@fairdrop/types/domain';

const FEE_TIERS = [
  { label: '0.30%', bps: 30 },
  { label: '0.50%', bps: 50 },
  { label: '1.00%', bps: 100 },
];

interface SeedLiquidityPanelProps {
  auction:            AuctionView;
  paymentsWithdrawn:  bigint;
  unsoldWithdrawn:    bigint;
}

export function SeedLiquidityPanel({
  auction,
  paymentsWithdrawn,
  unsoldWithdrawn,
}: SeedLiquidityPanelProps) {
  const { address } = useWallet();

  const [amountSaleToken, setAmountSaleToken] = useState('');
  const [amountCredits,   setAmountCredits]   = useState('');
  const [feeBps,          setFeeBps]          = useState(30);
  const [minLpInput,      setMinLpInput]      = useState('0');
  const [validation,      setValidation]      = useState<SeedLiquidityValidation | null>(null);
  const [validating,      setValidating]      = useState(false);

  // Rough available bounds (same logic as validateSeedLiquidity but from client state)
  const supply         = BigInt(auction.supply);
  const totalCommitted = BigInt(auction.totalCommitted);
  const creatorRevenue = BigInt(auction.creatorRevenue ?? 0);
  const maxSaleToken   = supply - totalCommitted - unsoldWithdrawn;
  const maxCredits     = creatorRevenue - paymentsWithdrawn;

  const rawSaleToken = useMemo(() => {
    try { return BigInt(amountSaleToken || '0'); } catch { return 0n; }
  }, [amountSaleToken]);
  const rawCredits = useMemo(() => {
    try { return BigInt(amountCredits || '0'); } catch { return 0n; }
  }, [amountCredits]);
  const rawMinLp = useMemo(() => {
    try { return BigInt(minLpInput || '0'); } catch { return 0n; }
  }, [minLpInput]);

  const input: SeedLiquidityInput | null = address && rawSaleToken > 0n && rawCredits > 0n
    ? { amountSaleToken: rawSaleToken, amountCredits: rawCredits, feeBps, minLp: rawMinLp, lpRecipient: address }
    : null;

  // Validate
  useEffect(() => {
    if (!input || !address) { setValidation(null); return; }
    let cancelled = false;
    setValidating(true);
    validateSeedLiquidity(auction, input, address).then((v) => {
      if (!cancelled) setValidation(v);
    }).finally(() => {
      if (!cancelled) setValidating(false);
    });
    return () => { cancelled = true; };
  }, [auction, input, address]);

  const {
    done, busy, isWaiting, error, trackedIds, advance, reset,
  } = useSeedLiquidity(auction, input);

  useEffect(() => {
    if (!done) return;
    setAmountSaleToken(''); setAmountCredits(''); setMinLpInput('0');
    reset();
  }, [done]);

  const canSubmit = input && validation?.valid && !busy && !isWaiting;

  return (
    <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <CardContent className="space-y-3 p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
          Seed DEX Liquidity
        </p>
        <p className="text-xs text-muted-foreground">
          Seed a DEX pool from auction proceeds. Creates a new pool if one doesn't exist.
        </p>

        <TokenAmountInput
          label={`Sale Tokens (${auction.saleTokenSymbol ?? 'token'})`}
          value={amountSaleToken}
          onChange={setAmountSaleToken}
          decimals={0}
          max={maxSaleToken > 0n ? maxSaleToken : undefined}
          placeholder="0"
        />

        <TokenAmountInput
          label="Credits (microcredits)"
          value={amountCredits}
          onChange={setAmountCredits}
          decimals={0}
          max={maxCredits > 0n ? maxCredits : undefined}
          placeholder="0"
        />

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Fee Tier</Label>
          <Select value={String(feeBps)} onValueChange={(v) => setFeeBps(Number(v))}>
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FEE_TIERS.map((t) => (
                <SelectItem key={t.bps} value={String(t.bps)} className="text-xs">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TokenAmountInput
          label="Min LP (slippage guard)"
          value={minLpInput}
          onChange={setMinLpInput}
          decimals={0}
          placeholder="0"
        />

        {validation && !validation.valid && (
          <div className="rounded-lg border border-destructive/15 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {validation.error}
          </div>
        )}

        <Button
          type="button"
          className="w-full"
          disabled={!canSubmit}
          onClick={() => void advance()}
        >
          {busy      ? <><Spinner className="mr-2 h-3 w-3" />Authorizing…</>
           : isWaiting ? <><Spinner className="mr-2 h-3 w-3" />Confirming…</>
           : validating ? <><Spinner className="mr-2 h-3 w-3" />Validating…</>
           : 'Seed Liquidity'}
        </Button>

        {error && (
          <div className="rounded-lg border border-destructive/15 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error.message}
          </div>
        )}

        <WizardTxStatus trackedIds={trackedIds} />
      </CardContent>
    </Card>
  );
}
