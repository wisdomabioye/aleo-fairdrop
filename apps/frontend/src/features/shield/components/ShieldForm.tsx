import { useState, useMemo } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import {
  Button, Card, CardContent, CardHeader, CardTitle,
  PrivacyBadge, Spinner, TokenAmountInput,
} from '@/components';
import { ShieldCheck, Info } from 'lucide-react';
import {
  CREDITS_DECIMALS, CREDITS_SYMBOL, CREDITS_RESERVED_TOKEN_ID,
  aleoToMicro, formatMicrocredits, microToAleo, shieldCredits,
} from '@fairdrop/sdk/credits';
import { DEFAULT_TX_FEE }           from '@fairdrop/sdk/transactions';
import { WizardTxStatus }           from '@/shared/components/WizardTxStatus';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { useTokenBalance }          from '@/shared/hooks/useTokenBalance';

export function ShieldForm() {
  const { address, executeTransaction } = useWallet();

  const [amount, setAmount] = useState('');

  const { data: publicBalance, isLoading: balanceLoading } =
    useTokenBalance(CREDITS_RESERVED_TOKEN_ID);

  const rawAmount = useMemo(() => aleoToMicro(amount) ?? 0n, [amount]);

  const validationError = useMemo(() => {
    if (!amount || rawAmount === 0n) return null;
    if (publicBalance != null && rawAmount > publicBalance) return 'Insufficient public balance';
    if (rawAmount > 18_446_744_073_709_551_615n) return 'Amount exceeds u64 max';
    return null;
  }, [amount, rawAmount, publicBalance]);

  const steps = [{
    label: 'Shield Credits',
    execute: async () => {
      const spec   = shieldCredits(address!, rawAmount);
      const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
      if (!result?.transactionId) {
        throw new Error('Wallet did not return a transaction ID — check your wallet for status.');
      }
      return result.transactionId;
    },
  }];

  const { done, busy, isWaiting, error, trackedIds, advance, reset } =
    useConfirmedSequentialTx(steps);

  const blocked  = busy || isWaiting;
  const canSubmit = !!amount && rawAmount > 0n && !validationError && !blocked;

  function handleReset() {
    reset();
    setAmount('');
  }

  return (
    <div className="space-y-6">
      {/* Info card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex gap-3 py-4">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              Shielding moves credits from your public{' '}
              <code className="text-foreground">credits.aleo</code> balance
              into a private on-chain UTXO record.
            </p>
            <p>
              The private record can then be selected in bid forms to keep your payment amount hidden.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Form card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <CardTitle className="text-base">Shield Amount</CardTitle>
            </div>

            <div className="text-right text-sm">
              {balanceLoading ? (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Spinner className="size-3.5" /> Fetching balance…
                </span>
              ) : publicBalance != null ? (
                <span>
                  <span className="text-xs text-muted-foreground">Public balance </span>
                  <span className="font-semibold text-foreground">
                    {formatMicrocredits(publicBalance)}
                  </span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Balance unavailable</span>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {done ? (
            <div className="space-y-4">
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                Credits shielded! The private record will appear in your wallet once the transaction confirms.
              </div>
              <WizardTxStatus trackedIds={trackedIds} />
              <Button variant="outline" className="w-full" onClick={handleReset}>
                Shield more
              </Button>
            </div>
          ) : (
            <>
              <TokenAmountInput
                label="Amount to shield"
                value={amount}
                onChange={(v) => setAmount(v)}
                decimals={CREDITS_DECIMALS}
                symbol={CREDITS_SYMBOL}
                max={publicBalance ?? undefined}
                maxLabel="Max"
                placeholder="0.00"
                error={validationError ?? undefined}
              />

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Network fee (paid from public balance)</span>
                <span>{microToAleo(BigInt(DEFAULT_TX_FEE))} {CREDITS_SYMBOL}</span>
              </div>

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive break-words">
                  {error.message}
                </div>
              )}

              <Button className="w-full" onClick={advance} disabled={!canSubmit}>
                {busy      ? <><Spinner className="mr-2 size-4" /> Waiting for wallet…</>
                : isWaiting ? <><Spinner className="mr-2 size-4" /> Awaiting confirmation…</>
                : 'Shield Credits'}
              </Button>

              <div className="flex justify-center">
                <PrivacyBadge state="private" />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
