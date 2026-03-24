import { useState, useMemo } from 'react';
import { useWallet }      from '@provablehq/aleo-wallet-adaptor-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  PrivacyBadge,
  Spinner,
  TokenAmountInput,
} from '@fairdrop/ui';
import { ShieldCheck, Info } from 'lucide-react';
import {
  CREDITS_DECIMALS,
  CREDITS_SYMBOL,
  CREDITS_RESERVED_TOKEN_ID,
  aleoToMicro,
  formatMicrocredits,
  microToAleo,
} from '@fairdrop/sdk/credits';
import { SYSTEM_PROGRAMS } from '@fairdrop/sdk/constants';
import { ConnectWalletPrompt }  from '@/shared/components/wallet/ConnectWalletPrompt';
import { useTokenBalance }      from '@/shared/hooks/useTokenBalance';
import { useTransactionStore }  from '@/stores/transaction.store';
import { TX_DEFAULT_FEE } from '@/env';

export function ShieldPage() {
  const { address, connected, executeTransaction } = useWallet();
  const { setTx } = useTransactionStore();

  const [amount,  setAmount]  = useState('');
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    data:      publicBalance,
    isLoading: balanceLoading,
  } = useTokenBalance(CREDITS_RESERVED_TOKEN_ID);

  const rawAmount = useMemo(() => aleoToMicro(amount) ?? 0n, [amount]);

  const validationError = useMemo(() => {
    if (!amount || rawAmount === 0n) return null; // no error shown for empty
    if (publicBalance != null && rawAmount > publicBalance)
      return 'Insufficient public balance';
    if (rawAmount > 18_446_744_073_709_551_615n)
      return 'Amount exceeds u64 max';
    return null;
  }, [amount, rawAmount, publicBalance]);

  const canSubmit = !!amount && rawAmount > 0n && !validationError && !busy;

  async function handleShield() {
    if (!canSubmit || !address) return;
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      const result = await executeTransaction({
        program:  SYSTEM_PROGRAMS.credits,
        function: 'transfer_public_to_private',
        inputs:   [address, `${rawAmount}u64`],
        fee:      TX_DEFAULT_FEE,
        privateFee: false
      });
      if (result?.transactionId) {
        setTx(result.transactionId, 'Shield Credits');
        setAmount('');
        setSuccess(true);
      } else {
        setError('Wallet did not return a transaction ID — check your wallet for status.');
      }
    } catch (err) {
      // Show the actual wallet/RPC error rather than a generic message
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <PageHeader
        title="Shield Credits"
        description="Convert public ALEO into a private record for use in private bids."
      />

      {!connected ? (
        <ConnectWalletPrompt message="Connect your wallet to shield credits." />
      ) : (
        <>
          {/* Info card */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex gap-3 py-4">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  Shielding moves credits from your public{' '}
                  <code className="text-foreground">{SYSTEM_PROGRAMS.credits}</code> balance
                  into a private on-chain UTXO record.
                </p>
                <p>
                  The private record can then be selected in bid forms to keep your payment amount hidden.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Shield form */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" />
                  <CardTitle className="text-base">Shield Amount</CardTitle>
                </div>

                {/* Balance */}
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
              <TokenAmountInput
                label="Amount to shield"
                value={amount}
                onChange={(v) => { setAmount(v); setError(null); setSuccess(false); }}
                decimals={CREDITS_DECIMALS}
                symbol={CREDITS_SYMBOL}
                max={publicBalance ?? undefined}
                maxLabel="Max"
                placeholder="0.00"
                error={validationError ?? undefined}
              />

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Network fee (paid from public balance)</span>
                <span>{microToAleo(BigInt(TX_DEFAULT_FEE))} {CREDITS_SYMBOL}</span>
              </div>

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive break-words">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                  Credits shielded! The private record will appear in your wallet once the transaction confirms.
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleShield}
                disabled={!canSubmit}
              >
                {busy
                  ? <><Spinner className="mr-2 size-4" /> Waiting for wallet…</>
                  : 'Shield Credits'
                }
              </Button>

              <div className="flex justify-center">
                <PrivacyBadge state="private" />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
